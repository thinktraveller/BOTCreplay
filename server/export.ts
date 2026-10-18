import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { createReplayStore,ApiError } from './replays.js';
import { createAssetCache } from './assets.js';
import { presentReplay } from '../shared/presentation/from-domain.js';
import { buildStandaloneHtml } from '../shared/export/html.js';
export async function savedExportSnapshot(store:ReturnType<typeof createReplayStore>,assets:ReturnType<typeof createAssetCache>,id:string,revision:number) {
  const document=await store.load(id);if(!document)throw new ApiError(404,'复盘不存在');
  if(!Number.isSafeInteger(revision)||document.revision!==revision)throw new ApiError(409,'已保存版本已经改变，请重新载入后导出');
  const presentation=presentReplay(document),warnings:string[]=[];
  await Promise.all(Object.entries(presentation.assets).map(async([id,view])=>{
    delete view.localUrl;
    const asset=document.assets.find(asset=>asset.assetId===id);
    if(asset?.status==='cached'&&asset.contentHash)try{view.dataUrl='data:image/png;base64,'+(await assets.read(asset.contentHash)).toString('base64');return;}catch{/* Missing cached bytes use the same explicit placeholder offline. */}
    warnings.push(`${view.label}：使用缺图占位`);
  }));
  return {document,presentation,warnings};
}
export function createHtmlExportApi(store:ReturnType<typeof createReplayStore>,assets:ReturnType<typeof createAssetCache>,viewerRoot=resolve('dist/viewer')) {
  return async(request:IncomingMessage,response:ServerResponse)=>{
    const url=new URL(request.url??'/','http://localhost'),match=/^\/api\/replays\/([a-zA-Z0-9_-]+)\/export\/(html|snapshot)$/.exec(url.pathname);
    if(!match)return false;if(request.method!=='GET')throw new ApiError(405,'导出快照仅支持GET');
    const snapshot=await savedExportSnapshot(store,assets,match[1],Number(url.searchParams.get('revision')));
    if(match[2]==='snapshot'){response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify({presentation:snapshot.presentation,warnings:snapshot.warnings}));return true;}
    const [javascript,css]=await Promise.all([readFile(resolve(viewerRoot,'viewer.js'),'utf8'),readFile(resolve(viewerRoot,'viewer.css'),'utf8')]);
    const html=buildStandaloneHtml(snapshot.presentation,{javascript,css});
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(`${snapshot.document.title}-r${snapshot.document.revision}.html`)}`,'X-Content-Type-Options':'nosniff'}).end(html);return true;
  };
}

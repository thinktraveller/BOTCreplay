import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { createReplayStore, ApiError, MAX_REPLAY_BYTES } from './replays.js';
import { createAssetCache } from './assets.js';
import { importScript } from '../shared/import/script.js';
import type { AssetReference, ReplayDocument } from '../shared/domain/contracts.js';
export function sendJson(response:ServerResponse,status:number,value:unknown) { response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(value)); }
export async function readJson(request:IncomingMessage,limit=MAX_REPLAY_BYTES):Promise<any> {
  if(!(request.headers['content-type']??'').startsWith('application/json')) throw new ApiError(415,'请使用JSON请求');
  let size=0; const chunks:Buffer[]=[]; for await(const chunk of request) { const data=Buffer.from(chunk); size+=data.length; if(size>limit) throw new ApiError(413,'请求超过大小上限'); chunks.push(data); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400,'JSON无法解析，原复盘未改变'); }
}
export function createReplayApi(root=resolve('runtime-data')) {
  const store=createReplayStore(resolve(root,'replays')), assets=createAssetCache(resolve(root,'assets'));
  async function cacheDocument(document:ReplayDocument,retry=false) {
    const value=structuredClone(document),refs:AssetReference[]=[];
    // Four workers bound concurrent downloads, with no total cache eviction.
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,value.script.roles.length)},async()=>{ while(cursor<value.script.roles.length) {
      const role=value.script.roles[cursor++],image=Array.isArray(role.raw.image)?role.raw.image[0]:role.raw.image;
      if(typeof image==='string'&&image) { const asset=await assets.cache(image,role.role.name,retry); refs.push(asset); role.role.iconAssetId=asset.assetId; }
    } }));
    const byRole=new Map(value.script.roles.map(item=>[item.role.roleId,item.role]));
    for(const player of value.initialState.players) for(const role of [player.actualRole,player.perceivedRole,player.disguise]) if(role&&byRole.get(role.roleId)?.iconAssetId) role.iconAssetId=byRole.get(role.roleId)!.iconAssetId;
    value.assets=[...new Map([...value.assets,...refs].map(asset=>[asset.assetId,asset])).values()]; return value;
  }
  return {store,assets,handle:async(request:IncomingMessage,response:ServerResponse)=>{
    const url=new URL(request.url??'/','http://localhost'),path=url.pathname;
    if(!path.startsWith('/api/replays')&&!path.startsWith('/api/assets/')&&path!=='/api/scripts/preview') return false;
    try {
      if(path==='/api/scripts/preview'&&request.method==='POST') { const body=await readJson(request,16*1024*1024); if(typeof body?.text!=='string') throw new ApiError(400,'请提供剧本原文'); sendJson(response,200,importScript(body.text)); return true; }
      const assetMatch=/^\/api\/assets\/([a-f0-9]{64})$/.exec(path);
      if(assetMatch&&request.method==='GET') { const data=await assets.read(assetMatch[1]); response.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}).end(data); return true; }
      if(path==='/api/replays'&&request.method==='GET') { sendJson(response,200,await store.list()); return true; }
      if(path==='/api/replays'&&request.method==='POST') { const body=await readJson(request); sendJson(response,201,await store.save(body.document,null)); return true; }
      const match=/^\/api\/replays\/([a-zA-Z0-9_-]+)(?:\/(history|cache)(?:\/(\d+))?)?$/.exec(path);
      if(!match) throw new ApiError(404,'接口不存在');
      const [,id,action,version]=match;
      if(action==='history'&&request.method==='GET') { sendJson(response,200,version?await store.loadVersion(id,Number(version)):await store.history(id)); return true; }
      const document=await store.load(id); if(!document) throw new ApiError(404,'复盘不存在');
      if(action==='cache'&&request.method==='POST') { const body=await readJson(request); if(body.expectedRevision!==document.revision) throw new ApiError(409,'缓存前复盘版本已改变，请重新载入'); sendJson(response,200,await store.save(await cacheDocument(document,!!body.retry),document.revision)); return true; }
      if(!action&&request.method==='GET') { sendJson(response,200,document); return true; }
      if(!action&&request.method==='PUT') { const body=await readJson(request); if(body.document?.replayId!==id) throw new ApiError(400,'复盘编号与路径不一致'); sendJson(response,200,await store.save(body.document,body.expectedRevision)); return true; }
      throw new ApiError(405,'此操作不支持该请求方法');
    } catch(error) { sendJson(response,error instanceof ApiError?error.status:500,{error:error instanceof Error?error.message:'本地操作失败，草稿已保留'}); return true; }
  }};
}

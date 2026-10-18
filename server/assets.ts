import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import sharp from 'sharp';
import type { AssetReference } from '../shared/domain/contracts.js';
import { ApiError } from './replays.js';
const MAX_BYTES=5*1024*1024, MAX_PIXELS=16_000_000;
export function validateRemoteAddress(address:string) {
  const value=address.toLowerCase().replace(/^::ffff:/,'');
  if(isIP(value)===4) { const a=value.split('.').map(Number); return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&a[1]===168||a[0]===100&&a[1]>=64&&a[1]<=127); }
  return isIP(value)===6 && !(/^(::|fc|fd|fe8|fe9|fea|feb)/.test(value));
}
export function createAssetCache(root=resolve('runtime-data/assets'), options:{fetcher?:typeof fetch;validateHost?:(url:URL)=>Promise<void>}={}) {
  const fetcher=options.fetcher??fetch;
  const validateHost=options.validateHost??(async(url:URL)=>{ const results=await lookup(url.hostname.replace(/^\[|\]$/g,''),{all:true}); if(!results.length||results.some(result=>!validateRemoteAddress(result.address))) throw new ApiError(422,'图标地址不可指向本机或内网'); });
  const active=new Map<string,Promise<AssetReference>>();
  const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
  const blobPath=(contentHash:string)=>resolve(root,contentHash+'.png');
  async function image(data:Buffer) {
    if(data.length>MAX_BYTES) throw new ApiError(413,'单个图标超过5MiB');
    // SVG is decoded once into a raster and is never executed in the browser.
    if(data.toString('utf8',0,2000).includes('<svg')) {
      const svg=data.toString('utf8');
      if(/<script|<foreignObject|<!DOCTYPE|<!ENTITY|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|webp);base64,)|@import|url\(\s*(?!#)/i.test(svg)) throw new ApiError(422,'SVG包含脚本或外部引用');
    }
    const decoder=sharp(data,{limitInputPixels:MAX_PIXELS}); const meta=await decoder.metadata();
    if(!['png','jpeg','webp','svg','gif','avif'].includes(meta.format??'')) throw new ApiError(422,'图标格式不受支持');
    const result=await decoder.resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer();
    if(result.length>MAX_BYTES) throw new ApiError(413,'图标转换后超过5MiB'); return result;
  }
  async function download(urlText:string):Promise<Buffer> {
    if(urlText.startsWith('data:')) { const match=/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,([a-z\d+/=]+)$/i.exec(urlText); if(!match||match[1].length>MAX_BYTES*1.4) throw new ApiError(422,'内嵌图标格式或大小无效'); return Buffer.from(match[1],'base64'); }
    let target=new URL(urlText);
    for(let redirect=0;redirect<4;redirect++) {
      if(!['http:','https:'].includes(target.protocol)||target.username||target.password) throw new ApiError(422,'图标仅支持无凭据HTTP(S)'); await validateHost(target);
      const response=await fetcher(target,{redirect:'manual',signal:AbortSignal.timeout(12_000)});
      if(response.status>=300&&response.status<400&&response.headers.get('location')) { await response.body?.cancel(); target=new URL(response.headers.get('location')!,target); continue; }
      if(!response.ok||!response.body) throw new ApiError(422,`图标下载失败：HTTP ${response.status}`);
      if(Number(response.headers.get('content-length'))>MAX_BYTES) { await response.body.cancel(); throw new ApiError(413,'单个图标超过5MiB'); }
      const chunks:Buffer[]=[]; let size=0;
      const reader=response.body.getReader();
      try { while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>MAX_BYTES){await reader.cancel();throw new ApiError(413,'单个图标超过5MiB');} chunks.push(Buffer.from(value)); } } finally {reader.releaseLock();}
      return Buffer.concat(chunks);
    } throw new ApiError(422,'图标重定向过多');
  }
  async function cache(originalUrl:string,label:string,retry=false):Promise<AssetReference> {
    if(originalUrl.length>MAX_BYTES*1.4) throw new ApiError(413,'图标地址过长');
    const urlHash=hash(originalUrl), assetId='asset-'+urlHash;
    const pointer=resolve(root,'url-'+urlHash+'.json');
    if(!retry) { try { const record=JSON.parse(await readFile(pointer,'utf8')) as AssetReference; await read(record.contentHash!); return {...record,placeholderLabel:label}; } catch { /* Retry missing/corrupt entries. */ } }
    const inFlight=active.get(originalUrl); if(inFlight) return {...await inFlight,placeholderLabel:label};
    const run=(async()=>{
      const base={assetId,originalUrl,mediaType:'image/png',placeholderLabel:label};
      try { let bytes:Buffer|undefined,last:unknown;
        for(let attempt=0;attempt<2;attempt++) try { bytes=await download(originalUrl); break; } catch(error) {last=error;} if(!bytes) throw last;
        const png=await image(bytes),contentHash=hash(png); await mkdir(root,{recursive:true});
        const temporary=blobPath(contentHash)+'.'+randomUUID()+'.tmp'; await writeFile(temporary,png); await rename(temporary,blobPath(contentHash));
        const record:AssetReference={...base,contentHash,status:'cached'}; const temp=pointer+'.'+randomUUID()+'.tmp'; await writeFile(temp,JSON.stringify(record)); await rename(temp,pointer); return record;
      } catch { return {...base,status:'failed' as const}; }
    })(); active.set(originalUrl,run); try{return await run;}finally{active.delete(originalUrl);}
  }
  async function read(contentHash:string) { if(!/^[a-f0-9]{64}$/.test(contentHash)) throw new ApiError(400,'资源哈希无效'); const data=await readFile(blobPath(contentHash)); if(hash(data)!==contentHash) throw new ApiError(422,'缓存图标校验失败，请重试下载'); return data; }
  async function ingest(dataUrl:string,asset:AssetReference) { const match=/^data:image\/png;base64,([a-z\d+/=]+)$/i.exec(dataUrl); if(!match||match[1].length>MAX_BYTES*1.4) throw new ApiError(422,'备份资源格式无效'); const data=await image(Buffer.from(match[1],'base64')); const contentHash=hash(data); if(contentHash!==asset.contentHash) throw new ApiError(422,'备份图标哈希不一致'); await mkdir(root,{recursive:true}); await writeFile(blobPath(contentHash),data); }
  return {cache,read,ingest,root};
}

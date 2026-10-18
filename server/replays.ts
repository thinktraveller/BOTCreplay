import { mkdir, readFile, readdir, rename, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ReplayDocument } from '../shared/domain/contracts.js';
import { projectReplay } from '../shared/domain/projection.js';
export class ApiError extends Error { constructor(public status:number, message:string) { super(message); } }
export const MAX_REPLAY_BYTES = 64 * 1024 * 1024;
export function safeId(id:string) { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new ApiError(400,'复盘编号无效'); return id; }
export function createReplayStore(root = resolve('runtime-data/replays')) {
  let pending:Promise<unknown> = Promise.resolve();
  const file = (id:string) => resolve(root, safeId(id) + '.json');
  async function load(id:string):Promise<ReplayDocument|undefined> {
    let raw:string; try { raw = await readFile(file(id),'utf8'); } catch(error) { if((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    let document:ReplayDocument; try { document = JSON.parse(raw); projectReplay(document); if(document.replayId !== id) throw Error(); } catch { throw new ApiError(500,'复盘文件无法读取或校验失败。原文件已保留，请从备份或恢复版本重新导入。'); }
    return document;
  }
  async function history(id:string) {
    safeId(id); let names:string[]; try { names = await readdir(resolve(root,'history')); } catch(error) { if((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    return names.filter(name=>name.startsWith(id+'.') && name.endsWith('.json')).map(name=>Number(name.slice(id.length+1,-5))).filter(Number.isSafeInteger).sort((a,b)=>b-a);
  }
  async function loadVersion(id:string, revision:number):Promise<ReplayDocument> {
    if(!Number.isSafeInteger(revision)||revision<1) throw new ApiError(400,'恢复版本无效');
    try { const value=JSON.parse(await readFile(resolve(root,'history',safeId(id)+'.'+revision+'.json'),'utf8')) as ReplayDocument; projectReplay(value); return value; } catch { throw new ApiError(404,'恢复版本不存在或已损坏'); }
  }
  async function save(value:ReplayDocument, expectedRevision:number|null):Promise<ReplayDocument> {
    const run=pending.catch(()=>{}).then(async()=>{
      if(!value||typeof value!=='object') throw new ApiError(422,'需要完整复盘数据');
      safeId(value.replayId);
      const current=await load(value.replayId);
      if((current?.revision??null)!==expectedRevision) throw new ApiError(409,`复盘已在其他窗口更新（当前版本${current?.revision??'不存在'}）。草稿仍保留，请重新载入或下载草稿。`);
      if(value.revision !== (expectedRevision??0)) throw new ApiError(409,'提交数据的版本与预期版本不一致');
      const next=structuredClone(value); next.revision=(current?.revision??0)+1;
      try { projectReplay(next); } catch(error) { throw new ApiError(422,(error as Error).message); }
      const data=JSON.stringify(next,null,2)+'\n';
      if(Buffer.byteLength(data)>MAX_REPLAY_BYTES) throw new ApiError(413,'复盘超过64MiB，请减少嵌入输入或另建复盘');
      await mkdir(root,{recursive:true}); await mkdir(resolve(root,'history'),{recursive:true});
      if(current) await writeFile(resolve(root,'history',`${safeId(current.replayId)}.${current.revision}.json`),JSON.stringify(current));
      const temp=file(next.replayId)+'.'+randomUUID()+'.tmp';
      try { await writeFile(temp,data,{encoding:'utf8',flag:'wx'}); await rename(temp,file(next.replayId)); }
      catch(error) { await unlink(temp).catch(()=>{}); throw error; }
      for(const revision of (await history(next.replayId)).slice(5)) await unlink(resolve(root,'history',`${next.replayId}.${revision}.json`)).catch(()=>{});
      return next;
    }); pending=run; return run;
  }
  async function list() {
    let names:string[]; try { names=await readdir(root); } catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT') return []; throw error; }
    const rows=[];
    for(const name of names.filter(name=>/^[a-zA-Z0-9_-]+\.json$/.test(name))) { const id=name.slice(0,-5); try { const doc=await load(id); if(doc) rows.push({replayId:id,title:doc.title,revision:doc.revision,events:doc.events.length}); } catch { rows.push({replayId:id,title:'无法读取的复盘（请恢复备份）',revision:0,events:0}); } }
    return rows;
  }
  return {load,save,list,history,loadVersion,root};
}

import { mkdir,readFile,writeFile,rm } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage,ServerResponse } from 'node:http';
import sharp from 'sharp';
import { EXPORT_LIMITS } from '../shared/export/limits.js';
import { composePngTiles } from './png.js';
import { ApiError,type createReplayStore } from './replays.js';
import type { createAssetCache } from './assets.js';
import { savedExportSnapshot } from './export.js';
interface Job {id:string;revision:number;title:string;directory:string;created:number;state:'receiving'|'composing'|'complete'|'cancelled'|'failed';tiles:{top:number;height:number;file:string}[];height:number;bytes:number;error?:string;lock:Promise<unknown>}
export function createPngJobs(store:ReturnType<typeof createReplayStore>,assets:ReturnType<typeof createAssetCache>,root:string) {
  const jobs=new Map<string,Job>(),base=resolve(root);
  async function clean(job:Job){if(!job.directory.startsWith(base+sep))throw Error('导出目录越界');await rm(job.directory,{recursive:true,force:true});}
  function find(id:string){const job=jobs.get(id);if(!job)throw new ApiError(404,'导出任务已过期，请重新导出');return job;}
  const view=(job:Job)=>({jobId:job.id,revision:job.revision,state:job.state,tiles:job.tiles.length,height:job.height,bytes:job.bytes,error:job.error});
  const json=(response:ServerResponse,status:number,value:unknown)=>response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(value));
  async function body(request:IncomingMessage,limit:number){let size=0;const chunks:Buffer[]=[];for await(const chunk of request){const value=Buffer.from(chunk);size+=value.length;if(size>limit)throw new ApiError(413,'图像片段超过大小上限');chunks.push(value);}return Buffer.concat(chunks);}
  return async(request:IncomingMessage,response:ServerResponse)=>{
    const url=new URL(request.url??'/','http://localhost');if(!url.pathname.startsWith('/api/png-jobs'))return false;
    try{
      for(const [id,job]of jobs)if(Date.now()-job.created>60*60*1000&&job.state!=='composing'){await clean(job).catch(()=>{});jobs.delete(id);}
      if(url.pathname==='/api/png-jobs'&&request.method==='POST'){
        if(jobs.size>=8){const old=[...jobs.values()].find(job=>['complete','cancelled','failed'].includes(job.state));if(old){await clean(old).catch(()=>{});jobs.delete(old.id);}else throw new ApiError(429,'已有多个导出任务，请先完成或取消');}
        let input:{replayId:string;revision:number;phaseId?:string};try{input=JSON.parse((await body(request,4096)).toString('utf8'));}catch{throw new ApiError(400,'需要复盘编号和保存版本');}
        const snapshot=await savedExportSnapshot(store,assets,input.replayId,input.revision,input.phaseId),id=randomUUID(),directory=resolve(base,id);await mkdir(directory,{recursive:true});
        const job:Job={id,revision:snapshot.document.revision,title:snapshot.document.title,directory,created:Date.now(),state:'receiving',tiles:[],height:0,bytes:0,lock:Promise.resolve()};jobs.set(id,job);json(response,201,{...view(job),presentation:snapshot.presentation,warnings:snapshot.warnings,limits:EXPORT_LIMITS});return true;
      }
      const match=/^\/api\/png-jobs\/([a-zA-Z0-9_-]+)(?:\/(tiles|compose|file))?$/.exec(url.pathname);if(!match)throw new ApiError(404,'导出接口不存在');const job=find(match[1]),action=match[2];
      if(request.method==='DELETE'&&!action){job.state='cancelled';await job.lock.catch(()=>{});await clean(job);json(response,200,view(job));return true;}
      if(request.method==='GET'&&!action){json(response,200,view(job));return true;}
      if(request.method==='GET'&&action==='file'){if(job.state!=='complete')throw new ApiError(409,'PNG尚未生成');const data=await readFile(resolve(job.directory,'replay.png'));response.writeHead(200,{'Content-Type':'image/png','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(job.title+'-r'+job.revision+'.png')}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(data);return true;}
      if(request.method==='PUT'&&action==='tiles'){
        const index=Number(url.searchParams.get('index')),top=Number(url.searchParams.get('top')),data=await body(request,EXPORT_LIMITS.tileBytes);
        const run=job.lock.catch(()=>{}).then(async()=>{
          if(job.state!=='receiving')throw new ApiError(409,'任务不再接收片段，请重新导出');
          if(index!==job.tiles.length||top!==job.height||!Number.isSafeInteger(index)||job.tiles.length>=EXPORT_LIMITS.maxTiles)throw new ApiError(422,'片段顺序或连续偏移不正确');
          const meta=await sharp(data,{limitInputPixels:EXPORT_LIMITS.width*EXPORT_LIMITS.tileHeight}).metadata();
          if(meta.format!=='png'||meta.width!==EXPORT_LIMITS.width||!meta.height||meta.height>EXPORT_LIMITS.tileHeight)throw new ApiError(422,'PNG片段宽高或格式超出预算');
          if((job.height+meta.height)*EXPORT_LIMITS.width>EXPORT_LIMITS.totalPixels)throw new ApiError(413,'总像素超过当前长图预算，请减少阶段或内容');
          const file=resolve(job.directory,`tile-${index}.png`);await writeFile(file,data);if(job.state!=='receiving'){await rm(file,{force:true});throw new ApiError(409,'任务已取消');}job.tiles.push({top,height:meta.height,file});job.height+=meta.height;return view(job);
        });job.lock=run;json(response,200,await run);return true;
      }
      if(request.method==='POST'&&action==='compose'){
        const run=job.lock.catch(()=>{}).then(async()=>{
          if(job.state!=='receiving'||!job.tiles.length)throw new ApiError(409,'没有可合成片段或任务已结束');job.state='composing';
          try{const tiles=await Promise.all(job.tiles.map(async tile=>({data:await readFile(tile.file),top:tile.top})));const result=await composePngTiles(tiles);if((job as Job).state==='cancelled')return view(job);await writeFile(resolve(job.directory,'replay.png'),result);job.bytes=result.length;job.state='complete';return view(job);}catch(error){if((job as Job).state!=='cancelled'){job.state='failed';job.error=(error as Error).message;}throw error;}
        });job.lock=run;json(response,200,await run);return true;
      }
      throw new ApiError(405,'此导出操作不支持该请求方法');
    }catch(error){json(response,error instanceof ApiError?error.status:500,{error:(error as Error).message??'导出失败，请重试'});return true;}
  };
}

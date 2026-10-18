<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { ReplayDocument, ScriptSnapshot } from '../shared/domain/contracts.js';
import { defaultScriptText, importScript, type ScriptImport } from '../shared/import/script.js';
import { BASE_COUNTS, createReplay, type SetupPlayer } from '../shared/domain/setup.js';
import { projectReplay } from '../shared/domain/projection.js';
import { presentReplay } from '../shared/presentation/from-domain.js';
import ReplayView from '../shared/presentation/ReplayView.vue';
import { TEAM_LABELS, copyJson } from '../shared/roles/editor-model.js';

const rows=ref<{replayId:string;title:string;revision:number;events:number}[]>([]), current=ref<ReplayDocument>();
const screen=ref<'list'|'setup'|'editor'>('list'),error=ref(''),message=ref(''),busy=ref(false);
const sourceText=ref(''),preview=ref<ScriptImport>(),script=ref<ScriptSnapshot>();
const title=ref('我的对局复盘'),count=ref(12),players=ref<SetupPlayer[]>([]),setupNotes=ref(''),dirty=ref(false);
const presentation=computed(()=>current.value?presentReplay(copyJson(current.value)):undefined);
const draftKey='botcreplay-replay-draft-v1';
const draftAvailable=ref(!!localStorage.getItem(draftKey));
const phaseLabel=(phase:ReplayDocument['phases'][number])=>phase.kind==='preparation'?'准备':`第${phase.number}${phase.kind==='night'?'夜':'天'}`;
async function api<T>(path:string,method='GET',body?:unknown):Promise<T> { const response=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined}); const value=await response.json(); if(!response.ok) throw new Error(value.error??'本地服务操作失败'); return value; }
async function act(fn:()=>Promise<void>) { error.value='';message.value='';busy.value=true;try{await fn();}catch(e){error.value=(e as Error).message;}finally{busy.value=false;} }
async function refresh() { rows.value=await api('/api/replays'); }
async function open(id:string) { await act(async()=>{current.value=await api('/api/replays/'+id);screen.value='editor';dirty.value=false;}); }
function previewImport(){preview.value=importScript(sourceText.value);}
function acceptScript() { if(preview.value?.script){script.value=preview.value.script;defaultSeats();} }
function defaultSeats(){ if(!script.value) return; const ordered=Object.keys(TEAM_LABELS).flatMap((team,i)=>script.value!.roles.filter(item=>item.role.type===team).slice(0,BASE_COUNTS[count.value]![i])); players.value=Array.from({length:count.value},(_,i)=>({nickname:`${i+1}号玩家`,roleId:ordered[i]?.role.roleId??script.value!.roles[i%script.value!.roles.length]!.role.roleId,alignment:ordered[i]?.role.type==='minion'||ordered[i]?.role.type==='demon'?'evil':'good'})); }
watch(count,defaultSeats);
function begin(){screen.value='setup';sourceText.value='';preview.value=undefined;script.value=undefined;error.value='';message.value='';}
function defaults(){sourceText.value=defaultScriptText();previewImport();acceptScript();}
async function readFile(event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(file){if(file.size>16*1024*1024){error.value='剧本文件超过16MiB';return;}sourceText.value=await file.text();previewImport();}}
async function clipboard(){try{sourceText.value=await navigator.clipboard.readText();previewImport();}catch{error.value='无法读取剪贴板，请粘贴文本或选择JSON文件。';}}
async function create(){await act(async()=>{if(!script.value)throw Error('请先预览并采用剧本');const document=createReplay(copyJson(script.value),{replayId:crypto.randomUUID(),title:title.value,players:copyJson(players.value),notes:setupNotes.value});current.value=await api('/api/replays','POST',{document});screen.value='editor';dirty.value=false;message.value='整局已保存，可进入首夜。';await refresh();});}
async function save(){await act(async()=>{if(!current.value)return;const saved=await api<ReplayDocument>('/api/replays/'+current.value.replayId,'PUT',{document:current.value,expectedRevision:current.value.revision});current.value=saved;dirty.value=false;localStorage.removeItem(draftKey);draftAvailable.value=false;message.value=`已保存修订 ${saved.revision}`;await refresh();});}
async function cache(){await act(async()=>{if(!current.value)return;if(dirty.value)throw Error('请先保存整局，再缓存图标');const saved=await api<ReplayDocument>('/api/replays/'+current.value.replayId+'/cache','POST',{expectedRevision:current.value.revision,retry:true});current.value=saved;message.value=`图标缓存完成：${saved.assets.filter(asset=>asset.status==='cached').length}成功，${saved.assets.filter(asset=>asset.status!=='cached').length}使用占位；可再次重试。`;});}
function restoreDraft(){try{const document=JSON.parse(localStorage.getItem(draftKey)??'null');projectReplay(document);current.value=document;screen.value='editor';dirty.value=true;message.value='已恢复本机草稿，保存时将检查版本冲突。';}catch{error.value='草稿无法校验，请先下载草稿保留原始内容。';}}
function download(data:string,name:string,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function draftDownload(){download(localStorage.getItem(draftKey)??'{}','BOTCreplay-草稿.json');}
function discardDraft(){localStorage.removeItem(draftKey);draftAvailable.value=false;}
watch(current,()=>{if(dirty.value&&current.value){try{localStorage.setItem(draftKey,JSON.stringify(current.value));draftAvailable.value=true;}catch{error.value='浏览器草稿存储已满，请保存或下载草稿。';}}},{deep:true});
onMounted(()=>void act(refresh));
</script>
<template>
  <section class="game-shell">
    <header class="game-head"><div><span class="eyebrow">BOTCREPLAY · 整局工作区</span><h1>把每个夜晚，留在时间里</h1><p>导入剧本，准备座位，记录说书人的实际裁决。</p></div><button @click="begin" :disabled="busy">＋ 新建复盘</button></header>
    <p v-if="error" class="notice error" role="alert">{{error}}</p><p v-if="message" class="notice" role="status">{{message}}</p>
    <p v-if="busy" class="notice" role="status">正在处理，请保留此页面…</p>
    <div v-if="draftAvailable" class="draft-bar">有本机未保存草稿 <button @click="restoreDraft">恢复草稿</button><button @click="draftDownload">下载草稿</button><button @click="discardDraft">清除草稿</button></div>
    <section v-if="screen==='list'" class="panel"><h2>本地复盘 <small>{{rows.length}} 局</small></h2><p v-if="!rows.length">从一份剧本开始。整局数据保存在本机，可随时继续。</p><div class="replay-list"><button v-for="row in rows" :key="row.replayId" @click="open(row.replayId)"><strong>{{row.title}}</strong><span>{{row.events}} 条记录 · 修订 {{row.revision}}</span></button></div></section>
    <template v-if="screen==='setup'">
      <section class="panel"><h2>1 · 导入剧本</h2><div class="toolbar"><button @click="defaults">使用默认角色库</button><button @click="clipboard">读取剪贴板</button><label class="file-button">选择JSON文件<input type="file" accept=".json,application/json" @change="readFile"></label></div>
      <label>剧本JSON原文<textarea v-model="sourceText" rows="7" placeholder="粘贴角色数组"></textarea></label><button @click="previewImport">校验并预览</button>
      <div v-if="preview"><p>{{preview.script?.roles.length??0}} 个可用角色 · {{preview.errors.length}} 个错误 · {{preview.warnings.length}} 个提示</p><ul class="import-issues"><li v-for="(issue,index) in preview.errors" :key="'e'+index" class="error">{{issue.path}} {{issue.line?`第${issue.line}行第${issue.column}列`:''}} {{issue.message}}</li><li v-for="(issue,index) in preview.warnings" :key="'w'+index">{{issue.path}} {{issue.message}}</li></ul><div class="role-chips"><span v-for="item in preview.script?.roles" :key="item.role.roleId">{{item.role.name}}</span></div><button :disabled="!preview.script" @click="acceptScript">采用预览剧本</button></div></section>
      <section v-if="script" class="panel"><h2>2 · 准备座位</h2><div class="setup-options"><label>复盘名称<input v-model="title"></label><label>玩家人数<select v-model="count"><option v-for="n in 9" :key="n" :value="n+6">{{n+6}} 人</option></select></label><button @click="defaultSeats">按基础数量推荐分配</button></div><p>基础推荐：{{BASE_COUNTS[count]?.join(' / ')}}（镇民 / 外来者 / 爪牙 / 恶魔）。实际配版以填写为准。</p>
      <div class="setup-table"><div v-for="(player,index) in players" :key="index" class="setup-row"><strong>{{index+1}}号</strong><label>昵称<input v-model="player.nickname" :aria-label="`${index+1}号昵称`"></label><label>实际角色<select v-model="player.roleId" :aria-label="`${index+1}号实际角色`"><option v-for="item in script.roles" :key="item.role.roleId" :value="item.role.roleId">{{item.role.name}} · {{TEAM_LABELS[item.role.type]}}</option></select></label><label>当前实际阵营<select v-model="player.alignment" :class="player.alignment" :aria-label="`${index+1}号阵营`"><option value="good">善良</option><option value="evil">邪恶</option></select></label><label>认知角色<select v-model="player.perceivedRoleId" :aria-label="`${index+1}号认知角色`"><option :value="undefined">无覆盖</option><option v-for="item in script.roles" :key="item.role.roleId" :value="item.role.roleId">{{item.role.name}}</option></select></label><label>伪装角色<select v-model="player.disguiseRoleId"><option :value="undefined">无</option><option v-for="item in script.roles" :key="item.role.roleId" :value="item.role.roleId">{{item.role.name}}</option></select></label></div></div>
      <label>设置关系、配版调整与准备说明<textarea v-model="setupNotes" placeholder="与基础数量不同、同角色多人、认知覆盖来源或特殊设置时写明依据"></textarea></label><button :disabled="busy" @click="create">保存准备 · 创建整局</button></section>
    </template>
    <template v-if="screen==='editor'&&current">
      <section class="panel"><div class="toolbar"><button @click="screen='list';refresh()">← 本地复盘</button><strong>{{current.title}} · 修订 {{current.revision}}</strong><button @click="save" :disabled="busy">保存整局</button><button @click="cache" :disabled="busy">缓存 / 重试剧本图标</button></div><p>当前阶段：{{phaseLabel(current.phases.at(-1)!)}} · {{current.initialState.players.length}} 人 · {{current.events.length}} 条记录</p><p class="muted">图标按需缓存到本机，下载失败保留角色文字与占位。</p></section>
      <ReplayView v-if="presentation" :replay="presentation" />
    </template>
  </section>
</template>

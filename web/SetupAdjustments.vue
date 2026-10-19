<script setup lang="ts">
import { computed,watch } from 'vue';
import type { ScriptSnapshot } from '../shared/domain/contracts.js';
import type { SetupPlayer } from '../shared/domain/setup.js';
import { copyJson } from '../shared/roles/editor-model.js';
import { adjustmentFor,collectSetupSources,resolveSetupAdjustments,SETUP_TARGET_LABELS,type SetupAdjustment,type SetupSource } from '../shared/roles/setup-policy.js';
const props=defineProps<{script:ScriptSnapshot;players:SetupPlayer[];modelValue:SetupAdjustment[];finalCount?:number}>();
const emit=defineEmits<{'update:modelValue':[SetupAdjustment[]];'update:finalCount':[number|undefined];recommend:[]}>();
const sources=computed(()=>collectSetupSources(props.script,props.players.map(player=>player.roleId)));
const overrides=computed(()=>sources.value.filter(source=>source.overridesOutsiders));
const resolution=computed(()=>{try{return {policy:resolveSetupAdjustments(props.players.map(player=>player.roleId),copyJson(props.modelValue),copyJson(props.script)),error:''};}catch(error){return {policy:undefined,error:(error as Error).message};}});
const source=(id:string)=>sources.value.find(source=>source.roleId===id);
const option=(row:SetupAdjustment)=>source(row.sourceRoleId)?.options.find(option=>option.id===row.optionId);
const seats=(id:string)=>props.players.flatMap((player,index)=>player.roleId===id?[`${index+1}号`]:[]).join('、');
const sourceLabels=(item:SetupSource)=>[...new Set(item.options.filter(option=>option.id!=='custom').map(option=>SETUP_TARGET_LABELS[option.target]))].join(' / ');
function update(index:number,changes:Partial<SetupAdjustment>){emit('update:modelValue',props.modelValue.map((row,i)=>i===index?{...row,...changes}:row));}
function choose(index:number,id:string,optionId?:string){const current=source(id);if(current)emit('update:modelValue',props.modelValue.map((row,i)=>i===index?adjustmentFor(current,optionId):row));}
function add(id=sources.value[0]?.roleId){const current=source(id);if(current)emit('update:modelValue',[...props.modelValue,adjustmentFor(current)]);}
watch(()=>sources.value.map(source=>source.roleId+'|'+source.ability).join('\n'),()=>{
  const valid=props.modelValue.filter(row=>source(row.sourceRoleId)?.options.some(option=>option.id===row.optionId&&option.target===row.target));
  if(valid.length!==props.modelValue.length)emit('update:modelValue',valid);
  if(!overrides.value.length&&props.finalCount!==undefined)emit('update:finalCount',undefined);
});
</script>
<template>
  <section class="panel setup-adjustments"><h2>设置调整与覆盖</h2><p>读取实际在场角色的当前技能。认知角色和伪装角色不作为设置来源；所有设置按本局实际选择保存。</p>
    <p v-if="!sources.length" class="muted">当前实际配版中没有检测到设置能力。选择其他实际角色后会更新。</p>
    <article v-for="item in sources" :key="item.roleId" class="setup-source"><strong>{{item.name}} · {{seats(item.roleId)}}</strong><p class="ability-text">{{item.ability}}</p><p>{{sourceLabels(item)}}</p><button @click="add(item.roleId)">选择{{item.name}}的设置</button></article>
    <p v-if="overrides.length" class="notice">在场覆盖来源：{{overrides.map(source=>source.name).join('、')}}。其他来源的外来者数量调整将被抑制，爪牙数量和固定角色仍保留。</p>
    <label v-if="overrides.length">实际最终外来者数量<input type="number" min="0" :max="players.length" :value="finalCount" aria-label="实际最终外来者数量" @input="$emit('update:finalCount',($event.target as HTMLInputElement).value===''?undefined:Number(($event.target as HTMLInputElement).value))"></label>
    <div class="toolbar"><button :disabled="!sources.length" @click="add()">＋ 记录设置调整</button><button :disabled="!modelValue.length||!!resolution.error" @click="$emit('recommend')">按数量调整推荐分配</button></div>
    <div v-for="(row,index) in modelValue" :key="index" class="setup-adjustment-row">
      <label>在场来源<select :value="row.sourceRoleId" :aria-label="`设置${index+1}来源`" @change="choose(index,($event.target as HTMLSelectElement).value)"><option v-for="item in sources" :key="item.roleId" :value="item.roleId">{{item.name}} · {{seats(item.roleId)}}</option></select></label>
      <label>设置选项<select :value="row.optionId" :aria-label="`设置${index+1}选项`" @change="choose(index,row.sourceRoleId,($event.target as HTMLSelectElement).value)"><option v-for="item in source(row.sourceRoleId)?.options" :key="item.id" :value="item.id">{{item.label}}</option></select></label>
      <label v-if="option(row)?.amounts">调整数量<select :value="row.amount" :aria-label="`设置${index+1}数量`" @change="update(index,{amount:Number(($event.target as HTMLSelectElement).value)})"><option v-for="amount in option(row)?.amounts" :key="amount" :value="amount">{{amount>0?'+':''}}{{amount}}</option></select></label>
      <label v-else-if="row.target==='outsider'||row.target==='minion'">调整数量（可空）<input type="number" :value="row.amount" :aria-label="`设置${index+1}数量`" @input="update(index,{amount:($event.target as HTMLInputElement).value===''?undefined:Number(($event.target as HTMLInputElement).value)})"></label>
      <label>实际设置与依据<textarea :value="row.description" :aria-label="`设置${index+1}说明`" rows="2" @input="update(index,{description:($event.target as HTMLTextAreaElement).value})"></textarea></label><button @click="$emit('update:modelValue',modelValue.filter((_,i)=>i!==index))">移除</button>
    </div>
    <p v-if="resolution.error" class="notice error" role="alert">{{resolution.error}}</p><p v-if="resolution.policy" class="muted">保留{{resolution.policy.accepted.length}}项调整；抑制{{resolution.policy.suppressed.length}}项外来者数量调整。数量推荐只分配角色数量，座位、认知、初始信息等由你按实际结果填写。</p>
  </section>
</template>
<style scoped>
.setup-source{border:1px solid #c9d8da;border-radius:10px;padding:14px;margin:12px 0}.ability-text{white-space:pre-wrap;overflow-wrap:anywhere}.setup-adjustment-row{display:grid;grid-template-columns:1fr 2fr 1fr;gap:12px;padding:14px;border:1px solid #c9d8da;margin:12px 0;border-radius:10px}.setup-adjustment-row label{min-width:0}.setup-adjustment-row select{width:100%;max-width:100%}.setup-adjustment-row label:has(textarea){grid-column:1/-1}@media(max-width:720px){.setup-adjustment-row{grid-template-columns:1fr}.setup-source{padding:10px}}
</style>

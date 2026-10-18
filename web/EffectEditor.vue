<script setup lang="ts">
import type { ReplayDocument,StateSnapshot } from '../shared/domain/contracts.js';
import { newEffectDraft,type EffectDraft, type EffectDraftKind } from '../shared/domain/recording.js';
const effects=defineModel<EffectDraft[]>({required:true});
defineProps<{document:ReplayDocument;state:StateSnapshot;playerId:string}>();
const labels:Record<EffectDraftKind,string>={death:'实际死亡',revive:'实际复活',alignment:'当前阵营变化',role:'实际角色变化',perceived:'认知角色变化',disguise:'伪装角色变化','clear-perceived':'清除认知角色','clear-disguise':'清除伪装角色',execution:'处决（生死另记）',drunk:'新增醉酒来源',poisoned:'新增中毒来源','zombuul-alive':'新增活尸来源','falsely-dead':'新增假死来源','end-condition':'解除指定状态来源',reminder:'添加标记','remove-reminder':'移除标记',grant:'获得独立能力',usage:'消费能力次数',lose:'失去能力',schedule:'建立待结算链',settle:'结算指定触发',cancel:'取消指定触发'};
const needsPlayer=(kind:string)=>!['end-condition','usage','lose','settle','cancel','schedule'].includes(kind);
const needsRole=(kind:string)=>['role','perceived','disguise','grant'].includes(kind);
</script>
<template>
 <section class="effect-editor"><div class="toolbar"><strong>显式实际后果</strong><button type="button" @click="effects.push(newEffectDraft('death',playerId))">＋ 添加后果</button></div><p class="muted">文字与收到信息不会自动改状态。处决与死亡、认知与实际分别记录；可组合多个后果。</p>
 <div v-for="(effect,index) in effects" :key="effect.id" class="effect-row">
  <label>后果类型<select v-model="effect.kind" :aria-label="`后果${index+1}类型`"><option v-for="(label,kind) in labels" :key="kind" :value="kind">{{label}}</option></select></label>
  <label v-if="needsPlayer(effect.kind)">受影响玩家<select v-model="effect.playerId" :aria-label="`后果${index+1}玩家`"><option value="">请选择</option><option v-for="player in state.players" :key="player.playerId" :value="player.playerId">{{player.seat}}号 {{player.nickname}} · {{player.actualRole.name}}{{player.life.actuallyAlive?'':' 💀'}}</option></select></label>
  <label v-if="needsRole(effect.kind)">新角色<select v-model="effect.roleId" :aria-label="`后果${index+1}新角色`"><option value="">请选择角色</option><option v-for="item in document.script.roles" :key="item.role.roleId" :value="item.role.roleId">{{item.role.name}}</option></select></label>
  <label v-if="effect.kind==='role'||effect.kind==='alignment'">变化后的当前实际阵营<select v-model="effect.alignment" :class="effect.alignment" :aria-label="`后果${index+1}阵营`"><option value="">请选择阵营</option><option value="good">善良 · 蓝字</option><option value="evil">邪恶 · 红字</option></select></label>
  <label v-if="effect.kind==='end-condition'">独立状态来源<select v-model="effect.reference"><option value="">请选择来源</option><option v-for="condition in state.conditions.filter(item=>item.active)" :key="condition.conditionId" :value="condition.conditionId">{{condition.targetPlayerId}} · {{condition.kind}} · {{condition.conditionId}} · {{condition.source.eventId}}</option></select></label>
  <label v-if="['usage','lose'].includes(effect.kind)">独立能力实例<select v-model="effect.reference"><option value="">请选择能力</option><option v-for="ability in state.abilities" :key="ability.abilityInstanceId" :value="ability.abilityInstanceId">{{ability.holder.kind==='player'?ability.holder.playerId:'说书人'}} · {{ability.rule.roleName??ability.rule.roleId}} · {{ability.mode==='real'?'真实':'认知'}} · {{ability.usage.state}} {{ability.usage.used}}/{{ability.usage.limit??'不限'}} · {{ability.abilityInstanceId}}</option></select></label>
  <label v-if="['settle','cancel'].includes(effect.kind)">待结算触发<select v-model="effect.reference"><option value="">请选择触发</option><option v-for="trigger in state.pendingTriggers.filter(item=>item.state==='pending'||item.state==='partly-settled')" :key="trigger.triggerId" :value="trigger.triggerId">{{trigger.chainId}} · 剩余{{trigger.remaining}} · {{trigger.window.description}} · {{trigger.triggerId}}</option></select></label>
  <label v-if="effect.kind==='remove-reminder'">已有标记<select v-model="effect.reference"><option value="">请选择标记</option><option v-for="reminder in state.players.find(player=>player.playerId===effect.playerId)?.reminders" :key="reminder.reminderId" :value="reminder.reminderId">{{reminder.text}}</option></select></label>
  <label v-if="effect.kind==='grant'">能力持有主体<select v-model="effect.holderKind"><option :value="undefined">玩家</option><option value="storyteller">说书人</option><option value="group">本次目标玩家组</option></select></label>
  <label v-if="effect.kind==='grant'&&effect.holderKind&&effect.holderKind!=='player'">主体名称<input v-model="effect.holderName" placeholder="说书人 / 玩家组名称"></label>
  <label v-if="effect.kind==='grant'">父能力实例（可选）<select v-model="effect.parentAbilityId"><option :value="undefined">无</option><option v-for="ability in state.abilities" :key="ability.abilityInstanceId" :value="ability.abilityInstanceId">{{ability.rule.roleName}} · {{ability.mode==='real'?'真实':'认知'}} · {{ability.abilityInstanceId}}</option></select></label>
  <label v-if="effect.kind==='grant'">能力性质<select v-model="effect.mode"><option value="real">真实能力</option><option value="perceived">认知能力</option></select></label>
  <label v-if="effect.kind==='grant'">死亡后入口<select v-model="effect.deathAccess"><option value="none">无</option><option value="on-death">关联死亡触发</option><option value="retained">死后保留</option><option value="source-trigger">待结算来源触发</option></select></label>
  <label v-if="effect.kind==='grant'">总次数上限（可空）<input v-model.number="effect.limit" type="number" min="0"></label>
  <label v-if="['usage','schedule','settle'].includes(effect.kind)">{{effect.kind==='schedule'?'待消费次数':'本次消耗'}}<input v-model.number="effect.amount" type="number" min="1" step="1"></label>
  <label v-if="effect.kind==='schedule'">链编号（可空）<input v-model="effect.reference" placeholder="旧/新目标组用独立链编号"></label>
  <label v-if="['drunk','poisoned','zombuul-alive','falsely-dead'].includes(effect.kind)">期限提醒<select v-model="effect.expiresPhaseId"><option :value="undefined">人工解除</option><option v-for="phase in document.phases" :key="phase.phaseId" :value="phase.phaseId">{{phase.kind==='preparation'?'准备':`${phase.kind==='night'?'夜':'日'}${phase.number}`}}</option></select></label>
  <label v-if="['schedule','cancel','reminder','grant','drunk','poisoned','zombuul-alive','falsely-dead'].includes(effect.kind)">来源说明 / 结算窗口<input v-model="effect.text" :aria-label="`后果${index+1}说明`"></label>
  <button type="button" @click="effects.splice(index,1)" :aria-label="`删除后果${index+1}`">移除</button>
 </div>
 </section>
</template>

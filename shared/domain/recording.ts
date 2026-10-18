import type { Alignment, EffectOperation, JsonValue, ReplayDocument, ReplayEvent, RoleReference, StateSnapshot } from './contracts.js';
import { projectReplay } from './projection.js';
import { requireFact } from './errors.js';
import { getActionProposal, getCurrentRule } from '../roles/catalog.js';
import { requireApprovedProposal } from '../roles/review.js';
import { renderBranch, roleBody, type EditorBranch, type EditorRole } from '../roles/editor-model.js';
import { createDefaultLibrary } from '../roles/editor-defaults.js';
const builtin=new Map(createDefaultLibrary().roles.map(role=>[role.id,role]));
export function templateEligibility(role:EditorRole,ruleVersion?:string):{allowed:boolean;formal:boolean;reason:string} {
  if(!role.enabled) return {allowed:false,formal:false,reason:'角色配置已归档'};
  if(role.origin==='custom'||!builtin.has(role.id)||JSON.stringify(roleBody(role))!==JSON.stringify(roleBody(builtin.get(role.id)!))) return {allowed:true,formal:false,reason:'本地自定义配置，按人工事实记录；不计为内置角色规则批准'};
  const proposal=getActionProposal(role.id),rule=getCurrentRule(role.id);
  try {requireFact(proposal&&rule,'role','角色无当前资料');requireApprovedProposal(proposal);requireFact(!ruleVersion||rule.version===ruleVersion,'version','事件能力版本与当前模板不一致');return {allowed:true,formal:true,reason:`当前完整方案已通过：${proposal.proposalVersion}`};}
  catch(error){return {allowed:false,formal:false,reason:(error as Error).message};}
}
export type EffectDraftKind='death'|'revive'|'alignment'|'role'|'perceived'|'disguise'|'clear-perceived'|'clear-disguise'|'execution'|'drunk'|'poisoned'|'zombuul-alive'|'falsely-dead'|'end-condition'|'reminder'|'remove-reminder'|'grant'|'usage'|'lose'|'schedule'|'settle'|'cancel';
export interface EffectDraft { id:string; kind:EffectDraftKind; playerId:string; roleId:string; alignment:Alignment|''; reference:string; text:string; amount:number; mode:'real'|'perceived'; deathAccess:'none'|'on-death'|'retained'|'source-trigger'; limit?:number; expiresPhaseId?:string; holderKind?:'player'|'storyteller'|'group'; holderName?:string; parentAbilityId?:string }
export interface EventDraft {
  eventId:string; phaseId:string; playerId:string; action:string; text:string; information:string; note:string; exceptionReason:string; targetIds:string[]; visibility:ReplayEvent['visibility'];
  sourceEventId:string; sourcePlayerId:string; relatedEffectIds:string[]; abilityId:string; effects:EffectDraft[];
  roleChangeKind:'exchange'|'replacement'; roleChangeStatus:'not-used'|'selected'|'failed'|'applied'; voteTotal?:number; voteDetails?:string;
  hintOrder?:string[];
  template?:{role:EditorRole;branch:EditorBranch;values:Record<string,string>;customKeys:string[];variantId:string;customText?:string;libraryRevision:number};
}
export function newEventDraft(phaseId:string,playerId=''):EventDraft {return {eventId:crypto.randomUUID(),phaseId,playerId,action:'自定义',text:'',information:'',note:'',exceptionReason:'',targetIds:[],visibility:'storyteller',sourceEventId:'',sourcePlayerId:'',relatedEffectIds:[],abilityId:'',effects:[],roleChangeKind:'replacement',roleChangeStatus:'applied'};}
export function newEffectDraft(kind:EffectDraftKind='death',playerId=''):EffectDraft{return {id:crypto.randomUUID(),kind,playerId,roleId:'',alignment:'',reference:'',text:'',amount:1,mode:'real',deathAccess:'none'};}
export function advancePhase(document:ReplayDocument):ReplayDocument {
  const value=structuredClone(document),last=[...value.phases].sort((a,b)=>a.order-b.order).at(-1)!;
  const kind=last.kind==='night'?'day':'night',number=last.kind==='preparation'?1:last.kind==='day'?last.number+1:last.number;
  value.phases.push({phaseId:crypto.randomUUID(),kind,number,order:last.order+1});projectReplay(value);return value;
}
export function buildRecordedEvent(document:ReplayDocument,draft:EventDraft,state:StateSnapshot=projectReplay(document).state):ReplayEvent {
  const phase=document.phases.find(phase=>phase.phaseId===draft.phaseId);requireFact(phase,'phase','请选择阶段');
  const role=(id:string):RoleReference=>{const item=document.script.roles.find(item=>item.role.roleId===id)?.role;requireFact(item,'role','请选择剧本中的角色');return structuredClone(item);};
  const player=(id:string)=>{const item=state.players.find(player=>player.playerId===id);requireFact(item,'player','请选择有效玩家');return item;};
  const event:ReplayEvent={eventId:draft.eventId,phaseId:draft.phaseId,order:Math.max(-1,...document.events.filter(event=>event.phaseId===draft.phaseId).map(event=>event.order))+1,subject:draft.playerId?{kind:'player',playerId:draft.playerId}:{kind:'storyteller',name:'说书人'},mode:'manual',targetPlayerIds:[...new Set(draft.targetIds)],action:{name:draft.action,input:{}},receivedInformation:draft.information||null,effects:[],relatedEffectIds:[...draft.relatedEffectIds],causes:draft.sourceEventId?[{eventId:draft.sourceEventId}]:[],visibility:draft.visibility,recipients:[],note:draft.note,...(draft.exceptionReason.trim()?{exceptionReason:draft.exceptionReason.trim()}: {})};
  let text=draft.text;
  if(draft.template) {
    const template=draft.template,ability=state.abilities.find(ability=>ability.abilityInstanceId===draft.abilityId),eligibility=templateEligibility(template.role,ability?.rule.version);
    requireFact(eligibility.allowed||template.customText!==undefined,'review',eligibility.reason);
    const rendered=renderBranch(template.branch,template.values,template.customText,template.customKeys,template.variantId);requireFact(!rendered.missing.length,'fields','请补充：'+rendered.missing.join('、'));
    text=rendered.text;
    event.action.input={templateSnapshot:JSON.parse(JSON.stringify(template)) as JsonValue,renderedText:text,reviewedPreset:eligibility.formal&&template.customText===undefined};
    if(ability){event.abilityInstanceId=ability.abilityInstanceId;event.mode=ability.mode==='perceived'?'perceived-action':eligibility.formal?'real-ability':'manual';}
    if(ability&&eligibility.formal)requireFact(ability.rule.roleId===template.role.id,'template-role','模板角色须与本次能力实例一致；借用其他来源请人工记录并关联来源');
  } else if(draft.abilityId) {const ability=state.abilities.find(ability=>ability.abilityInstanceId===draft.abilityId);requireFact(ability,'ability','能力实例不存在');event.abilityInstanceId=ability.abilityInstanceId;event.mode=ability.mode==='perceived'?'perceived-action':'manual';}
  if(text.trim())event.customRecords=[{part:'action',branchPath:[draft.template?.role.id??'general',draft.template?.branch.id??draft.action],choice:'自定义',text}];
  requireFact(text.trim()||draft.action!=='自定义','text','请填写自定义正文');
  if(draft.action==='投票') {requireFact(draft.voteTotal!==undefined&&Number.isSafeInteger(draft.voteTotal)&&draft.voteTotal>=0,'votes','总票数须为非负整数');event.action.input.总票数=draft.voteTotal;event.action.input.个人票及技能补录=draft.voteDetails??'';event.action.input.投票发生时=JSON.parse(JSON.stringify(state.players)) as JsonValue;}
  if(draft.sourcePlayerId) {
    requireFact(draft.sourceEventId,'source','请选择触发来源事件');const source=projectReplay(document).events.find(snapshot=>snapshot.eventId===draft.sourceEventId);const origin=source?.before.players.find(player=>player.playerId===draft.sourcePlayerId);requireFact(origin,'source','来源事件没有该玩家');event.abilityOrigin={eventId:draft.sourceEventId,timing:'before',playerId:origin.playerId,role:structuredClone(origin.actualRole)};
  }
  event.action.input.editorDraft=JSON.parse(JSON.stringify(draft)) as JsonValue;
  if(draft.hintOrder)event.action.input.hintOrder=[...draft.hintOrder];
  let order=0;
  const add=(effect:object,id:string=crypto.randomUUID())=>{event.effects.push({effectId:id,order:order++,source:{eventId:event.eventId,...(event.abilityInstanceId?{abilityInstanceId:event.abilityInstanceId}:{})},...effect} as EffectOperation);};
  const changes=draft.effects.filter(effect=>effect.kind==='role');
  if(changes.length||draft.action==='角色变化') {
    const affected=changes.map(change=>change.playerId),selected=draft.targetIds.length?draft.targetIds:affected;
    event.roleChange={kind:draft.roleChangeKind,status:draft.roleChangeStatus,selectedPlayerIds:draft.roleChangeStatus==='not-used'?[]:[...selected],...(draft.roleChangeStatus==='applied'?{affectedPlayerIds:affected,resultId:'result-'+draft.eventId}:{})};
    requireFact(draft.roleChangeStatus==='applied'||!changes.length,'role-change','仅选择、失败或未使用时不能填写实际换角效果');
    if(changes.length) add({kind:'change-roles',resultId:'result-'+draft.eventId,changeKind:draft.roleChangeKind,changes:changes.map(change=>{const before=player(change.playerId);requireFact(change.alignment,'alignment','请在新角色后逐人选择当前实际阵营');return {playerId:change.playerId,from:structuredClone(before.actualRole),to:role(change.roleId),fromAlignment:before.alignment,toAlignment:change.alignment};})});
  }
  for(const effect of draft.effects.filter(effect=>effect.kind!=='role')) {
    const id=effect.id,playerId=effect.playerId,reference=effect.reference;
    switch(effect.kind) {
      case 'death':case 'revive':player(playerId);add({kind:'set-life',playerId,actuallyAlive:effect.kind==='revive'},id);break;
      case 'alignment':requireFact(effect.alignment,'alignment','请选择当前实际阵营');add({kind:'set-alignment',playerId,alignment:effect.alignment},id);break;
      case 'perceived':case 'disguise':add({kind:'set-role',playerId,role:role(effect.roleId),perception:effect.kind},id);break;
      case 'clear-perceived':case 'clear-disguise':add({kind:'clear-role',playerId,perception:effect.kind==='clear-perceived'?'perceived':'disguise'},id);break;
      case 'execution':add({kind:'execution',playerId,...(draft.exceptionReason?{exceptionReason:draft.exceptionReason}:{})},id);break;
      case 'drunk':case 'poisoned':case 'zombuul-alive':case 'falsely-dead':add({kind:'add-condition',condition:{conditionId:'condition-'+id,kind:effect.kind,targetPlayerId:playerId,source:{eventId:event.eventId},startsAt:{phaseId:draft.phaseId,eventId:event.eventId},expires:effect.expiresPhaseId?{kind:'point',point:{phaseId:effect.expiresPhaseId}}:{kind:'manual',description:effect.text||'由说书人另记解除'},active:true}},id);break;
      case 'end-condition':add({kind:'end-condition',conditionId:reference},id);break;
      case 'reminder':requireFact(effect.text.trim(),'reminder','请填写标记内容');add({kind:'set-reminder',playerId,reminder:{reminderId:'reminder-'+id,text:effect.text,source:{eventId:event.eventId}},active:true},id);break;
      case 'remove-reminder':{const reminder=player(playerId).reminders.find(reminder=>reminder.reminderId===reference);requireFact(reminder,'reminder','请选择已有标记');add({kind:'set-reminder',playerId,reminder,active:false},id);break;}
      case 'grant':{const ref=role(effect.roleId),rule=document.rules.find(rule=>rule.roleId===ref.roleId&&rule.version===ref.ruleVersion);requireFact(rule,'rule','能力需要剧本中的规则快照');const holder=effect.holderKind==='storyteller'?{kind:'storyteller',name:effect.holderName||'说书人'}:effect.holderKind==='group'?{kind:'group',name:effect.holderName||'玩家组',playerIds:[...draft.targetIds]}:{kind:'player',playerId};add({kind:'grant-ability',ability:{abilityInstanceId:'ability-'+id,holder,rule,mode:effect.mode,parameters:{说明:effect.text},usage:{state:'unused',used:0,...(effect.limit!==undefined&&effect.limit!==('' as unknown)?{limit:effect.limit}:{}),evidenceEventIds:[]},startsAt:{phaseId:draft.phaseId,eventId:event.eventId},source:{eventId:event.eventId,...(draft.abilityId?{abilityInstanceId:draft.abilityId}:{})},...(effect.parentAbilityId?{parentAbilityInstanceId:effect.parentAbilityId}:{}),deathAccess:effect.deathAccess}},id);break;}
      case 'usage':case 'lose':{const ability=state.abilities.find(ability=>ability.abilityInstanceId===reference);requireFact(ability,'ability','请选择能力实例');const used=effect.kind==='usage'?ability.usage.used+effect.amount:ability.usage.used;add({kind:'update-ability',abilityInstanceId:reference,usage:{...ability.usage,used,state:effect.kind==='lose'?'lost':ability.usage.limit!==undefined&&used>=ability.usage.limit?'consumed':'activated',evidenceEventIds:[...ability.usage.evidenceEventIds,event.eventId]}},id);break;}
      case 'schedule':requireFact(effect.text.trim(),'trigger','请描述待结算窗口');add({kind:'schedule-trigger',trigger:{triggerId:'trigger-'+id,chainId:reference||'chain-'+id,source:{eventId:event.eventId,...(draft.abilityId?{abilityInstanceId:draft.abilityId}:{})},targetPlayerIds:[...draft.targetIds],window:{description:effect.text},remaining:effect.amount,state:'pending',settlements:[],parameters:{}}},id);break;
      case 'settle':add({kind:'settle-trigger',triggerId:reference,consumed:effect.amount,effectIds:event.effects.filter(effect=>!['settle-trigger','schedule-trigger'].includes(effect.kind)).map(effect=>effect.effectId)},id);break;
      case 'cancel':requireFact(effect.text.trim(),'trigger','请填写取消原因');add({kind:'cancel-trigger',triggerId:reference,reason:effect.text},id);break;
    }
  }
  return event;
}
export function appendRecordedEvent(document:ReplayDocument,draft:EventDraft):ReplayDocument {const value=structuredClone(document),order=value.phases.find(phase=>phase.phaseId===draft.phaseId)?.order??Infinity;const before={...value,events:value.events.filter(event=>(value.phases.find(phase=>phase.phaseId===event.phaseId)?.order??Infinity)<=order)};value.events.push(buildRecordedEvent(value,draft,projectReplay(before).state));projectReplay(value);return value;}

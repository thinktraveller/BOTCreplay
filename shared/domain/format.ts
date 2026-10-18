import type { EffectOperation, EventSnapshot, JsonValue, PlayerState, ReplayEvent, RoleChangeResult, StateSnapshot, Subject } from './contracts.js';
import { playerById } from './state.js';

export interface IdentityPart { text: string; alignment?: 'good' | 'evil'; playerId?: string }
export function formatPlayerIdentity(player: PlayerState, state: StateSnapshot): string {
  const attributes: string[] = [player.actualRole.name + (player.perceivedRole ? `[${player.perceivedRole.name}]` : '')];
  const conditions = state.conditions.filter(x => x.active && x.targetPlayerId === player.playerId);
  const labels = { drunk: '醉酒', poisoned: '中毒', 'zombuul-alive': '活尸', 'falsely-dead': '假死', registration: '特殊识别' };
  for (const kind of new Set(conditions.map(x => x.kind))) attributes.push(labels[kind]);
  for (const ability of state.abilities.filter(x => x.holder.kind === 'player' && x.holder.playerId === player.playerId && x.usage.state !== 'lost')) {
    const inherited = ability.source || ability.parentAbilityInstanceId || ability.rule.roleId !== player.actualRole.roleId;
    const abilityName = ability.rule.roleName ?? (typeof ability.parameters.displayName === 'string' ? ability.parameters.displayName : ability.rule.roleId);
    if (inherited) attributes.push(`${ability.mode === 'perceived' ? '认知获得' : '获得'}${abilityName}能力${ability.usage.state === 'consumed' ? '（已耗尽）' : ''}`);
  }
  if (player.disguise) attributes.push(`伪装为${player.disguise.name}`);
  return `${player.nickname}（${attributes.join('，')}）${player.life.actuallyAlive ? '' : '💀'}`;
}
export function formatSubject(subject: Subject, state: StateSnapshot): IdentityPart[] {
  if (subject.kind === 'player') { const player = playerById(state, subject.playerId); return [{ text: formatPlayerIdentity(player, state), alignment: player.alignment, playerId: player.playerId }]; }
  if (subject.kind === 'storyteller') return [{ text: subject.name }];
  if (!subject.playerIds.length) return [{ text: subject.name }];
  return [{ text: `${subject.name}：` }, ...subject.playerIds.flatMap((id, index) => { const player = playerById(state, id); return [...(index ? [{ text: '、' }] : []), { text: formatPlayerIdentity(player, state), alignment: player.alignment, playerId: id }]; })];
}
export function formatRecordedValue(value: JsonValue): string {
  if (value === null) return '无';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.map(formatRecordedValue).join('、');
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}：${formatRecordedValue(item)}`).join('；');
  return String(value);
}
export function formatEffect(effect: EffectOperation, before: StateSnapshot, after: StateSnapshot): string {
  const playerName = (id: string) => playerById(after, id).nickname;
  const abilityName=(id:string)=>[...before.abilities,...after.abilities].find(ability=>ability.abilityInstanceId===id)?.rule.roleName??'能力';
  switch (effect.kind) {
    case 'change-roles': return effect.changes.map(change => `${playerName(change.playerId)}现在的角色是${change.to.name}，当前阵营为${(change.toAlignment ?? playerById(after, change.playerId).alignment) === 'good' ? '善良' : '邪恶'}`).join('\n');
    case 'set-role': return `${playerName(effect.playerId)}的${effect.perception === 'actual' ? '真实角色' : effect.perception === 'perceived' ? '认知角色' : '伪装'}为${effect.role.name}`;
    case 'clear-role': return `${playerName(effect.playerId)}清除${effect.perception === 'perceived' ? '认知角色' : '伪装'}`;
    case 'set-alignment': return `${playerName(effect.playerId)}转为${effect.alignment === 'good' ? '善良' : '邪恶'}`;
    case 'set-life': return `${playerName(effect.playerId)}${effect.actuallyAlive ? '实际存活' : '实际死亡'}`;
    case 'execution': return `${playerName(effect.playerId)}被处决（生死另记）`;
    case 'add-condition': return `${playerName(effect.condition.targetPlayerId)}新增${({ drunk: '醉酒', poisoned: '中毒', 'zombuul-alive': '活尸', 'falsely-dead': '假死', registration: '特殊识别' })[effect.condition.kind]}（独立来源）`;
    case 'end-condition': { const condition = before.conditions.find(x => x.conditionId === effect.conditionId) ?? after.conditions.find(x => x.conditionId === effect.conditionId); return `${condition ? playerName(condition.targetPlayerId) : ''}解除一项${condition?({drunk:'醉酒',poisoned:'中毒','zombuul-alive':'活尸','falsely-dead':'假死',registration:'特殊识别'})[condition.kind]:'状态'}来源`; }
    case 'grant-ability': return `${formatSubject(effect.ability.holder, after).map(x => x.text).join('')}获得${effect.ability.mode === 'perceived' ? '认知' : '真实'}${effect.ability.rule.roleName??'角色'}能力`;
    case 'update-ability': return `${abilityName(effect.abilityInstanceId)}能力：已用${effect.usage.used}${effect.usage.limit === undefined ? '' : `/${effect.usage.limit}`}，${({ unused: '未使用', activated: '已发动', consumed: '已耗尽', lost: '已失去' })[effect.usage.state]}`;
    case 'set-reminder': return `${playerName(effect.playerId)}${effect.active ? '添加' : '移除'}标记“${effect.reminder.text}”`;
    case 'schedule-trigger': return `建立待结算：${effect.trigger.targetPlayerIds.map(playerName).join('、')}，${effect.trigger.window.description}，剩余${effect.trigger.remaining}次`;
    case 'settle-trigger': return `本次待结算触发实际消耗${effect.consumed}次，关联后果${effect.effectIds.length}项`;
    case 'cancel-trigger': return `取消待结算触发：${effect.reason}`;
  }
}
export function formatEventText(event: ReplayEvent, before: StateSnapshot, after: StateSnapshot, context?: { origin?: EventSnapshot['abilityOrigin']; referencedResult?: RoleChangeResult }): { action: string; information: string; effects: string[]; lines: IdentityPart[][] } {
  const internalKeys=new Set(['editorDraft','recordingDraft','templateSnapshot','renderedText','reviewedPreset','投票发生时','hintOrder','总票数','个人票及技能补录']);
  const visibleInput=Object.fromEntries(Object.entries(event.action.input).filter(([key])=>!internalKeys.has(key)));
  let action = `${event.action.name}${Object.keys(visibleInput).length ? `：${formatRecordedValue(visibleInput)}` : ''}`;
  let actionParts: IdentityPart[] = [{ text: action }];
  if (event.roleChange) {
    const subject = formatSubject(event.subject, before);
    const origin = context?.origin;
    const source = origin ? formatSubject({kind:'player',playerId:origin.playerId},origin.state) : [];
    const targets = event.roleChange.selectedPlayerIds.flatMap((id,index) => [...(index ? [{text:'和'}] : []), ...formatSubject({kind:'player',playerId:id},before)]);
    if (event.roleChange.status === 'not-used') actionParts = [...subject,{text:'未使用'},...source,{text:source.length ? '提供的换角机会。' : '本次换角机会。'}];
    else actionParts = [...subject,...(source.length ? [{text:'因'},...source,{text:'的能力而'}] : []),{text:event.roleChange.wording === 'trigger'?'记录了':'选择了'},...targets,{text:(event.roleChange.wording === 'trigger'?'的换角触发':'')+'，'+(event.roleChange.status === 'applied' ? event.roleChange.kind === 'exchange' ? '他们的角色交换了' : '角色变化已生效' : event.roleChange.status === 'selected' ? '换角结果待填写' : '本次换角未生效')+'。'}];
    action = actionParts.map(part=>part.text).join('');
  }
  const resultLine = (name: string, role: string, alignment: 'good'|'evil', playerId: string): IdentityPart[] => [{text:`${name}现在的角色是${role}，当前阵营为`,alignment,playerId},{text:alignment==='good'?'善良':'邪恶',alignment,playerId}];
  let effectLines: IdentityPart[][] = [...event.effects].sort((a,b)=>a.order-b.order).flatMap(effect=>effect.kind==='change-roles' ? effect.changes.map(change=>resultLine(playerById(after,change.playerId).nickname,change.to.name,change.toAlignment??playerById(after,change.playerId).alignment,change.playerId)) : [[{text:formatEffect(effect,before,after)}]]);
  if(context?.referencedResult)effectLines.push(...context.referencedResult.changes.map(change=>resultLine(change.after.nickname,change.after.actualRole.name,change.after.alignment,change.playerId)));
  const requiredRoleLines = event.effects.flatMap(effect=>effect.kind==='change-roles'?effect.changes.map(change=>resultLine(playerById(after,change.playerId).nickname,change.to.name,change.toAlignment??playerById(after,change.playerId).alignment,change.playerId)):[]);
  if(context?.referencedResult)requiredRoleLines.push(...context.referencedResult.changes.map(change=>resultLine(change.after.nickname,change.after.actualRole.name,change.after.alignment,change.playerId)));
  let information = event.receivedInformation === null ? '' : `收到信息：${formatRecordedValue(event.receivedInformation)}`;
  const custom = new Map(event.customRecords?.map(record=>[record.part,record.text]));
  if(custom.has('action')){action=custom.get('action')!;actionParts=[{text:action}];}
  if(custom.has('information'))information=custom.get('information')!;
  if(custom.has('result'))effectLines=[[{text:custom.get('result')!}],...requiredRoleLines];
  if(custom.has('follow-up'))effectLines.push([{text:custom.get('follow-up')!}]);
  if(event.action.name==='投票'&&typeof event.action.input.总票数==='number')effectLines.unshift([{text:`总票数：${event.action.input.总票数}${event.action.input.个人票及技能补录?`；个人票及技能补录：${formatRecordedValue(event.action.input.个人票及技能补录)}`:''}`}]);
  return { action, information, effects:effectLines.map(line=>line.map(part=>part.text).join('')), lines:[...(action?[actionParts]:[]),...(information?[[{text:information}]]:[]),...effectLines] };
}

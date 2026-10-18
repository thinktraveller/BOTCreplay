import type { ReplayDocument } from '../domain/contracts.js';
import type { ReplayProjection } from '../domain/projection.js';
import { projectReplay } from '../domain/projection.js';
import { formatEventText, formatPlayerIdentity, formatSubject } from '../domain/format.js';
import type { ReplayPresentation } from './types.js';
import type { StateSnapshot } from '../domain/contracts.js';
function playersAt(state:StateSnapshot){return [...state.players].sort((a,b)=>a.seat-b.seat).map(player=>({playerId:player.playerId,seat:player.seat,nickname:player.nickname,identity:formatPlayerIdentity(player,state),alignment:player.alignment,alive:player.life.actuallyAlive,iconAssetId:player.actualRole.iconAssetId,states:state.conditions.filter(condition=>condition.targetPlayerId===player.playerId&&condition.active).map(condition=>`${({drunk:'醉酒',poisoned:'中毒','zombuul-alive':'活尸','falsely-dead':'假死',registration:'特殊识别'})[condition.kind]} · 来源 ${condition.source.eventId}`),abilities:state.abilities.filter(ability=>ability.holder.kind==='player'&&ability.holder.playerId===player.playerId).map(ability=>`${ability.rule.roleName??ability.rule.roleId}（${ability.mode==='real'?'真实':'认知'}，${ability.usage.used}/${ability.usage.limit??'不限'}，${({unused:'未使用',activated:'已发动',consumed:'已耗尽',lost:'已失去'})[ability.usage.state]}）`),reminders:player.reminders.map(reminder=>reminder.text)}));}

export function presentReplay(document: ReplayDocument, projection: ReplayProjection = projectReplay(document)): ReplayPresentation {
  const events = new Map(document.events.map(x => [x.eventId, x]));
  const roleResults = new Map(projection.events.flatMap(snapshot => (snapshot.roleChangeResults ?? []).map(result => [result.resultId, result] as const)));
  return {
    replayId: document.replayId, revision: document.revision, title: document.title,
    phases: [...document.phases].sort((a, b) => a.order - b.order).map(phase => ({ phaseId: phase.phaseId, label: phase.kind === 'preparation' ? '准备' : `第${phase.number}${phase.kind === 'night' ? '夜' : '天'}` })),
    assets: Object.fromEntries(document.assets.map(asset => [asset.assetId, { label: asset.placeholderLabel,...(asset.status==='cached'&&asset.contentHash?{localUrl:'/api/assets/'+asset.contentHash}:{}) }])),
    events: projection.events.map(snapshot => {
      const event = events.get(snapshot.eventId)!;
      const parts = formatSubject(event.subject, snapshot.before);
      const referencedResult = event.roleChangeResultId ? roleResults.get(event.roleChangeResultId) : undefined;
      const content = formatEventText(event, snapshot.before, snapshot.after, { origin: snapshot.abilityOrigin, referencedResult });
      const subject = event.subject;
      const player = subject.kind === 'player' ? snapshot.before.players.find(x => x.playerId === subject.playerId) : undefined;
      const richText = !!(event.roleChange || referencedResult || event.customRecords?.length);
      return {
        eventId: event.eventId, phaseId: event.phaseId, subject: parts.map(x => x.text).join(''), subjectParts: parts,
        alignment: player?.alignment ?? 'good', text: richText ? content.lines.map(line=>line.map(part=>part.text).join('')).join('\n') : [content.action, content.information, ...content.effects].filter(Boolean).join('；'),
        ...(richText ? {textParts:content.lines} : {}),
        details: [event.note, `可见范围：${({public:'公开',private:'私下',storyteller:'说书人'})[event.visibility]}`,event.exceptionReason ? `特殊裁决：${event.exceptionReason}` : '', `因果来源：${event.causes.map(x => x.eventId).join('、') || '无'}`, `关联后果：${event.relatedEffectIds.join('、') || '无'}`,snapshot.after.pendingTriggers.filter(trigger=>trigger.state==='pending'||trigger.state==='partly-settled').map(trigger=>`待结算 ${trigger.chainId}：剩余${trigger.remaining}，${trigger.window.description}`).join('\n')].filter(Boolean).join('\n'),
        iconAssetId: player?.actualRole.iconAssetId,
        roleChangeResultIds: [...(snapshot.roleChangeResults ?? []).map(result => result.resultId), ...(event.roleChangeResultId ? [event.roleChangeResultId] : [])],
        players:playersAt(snapshot.before),playersAfter:playersAt(snapshot.after),
      };
    }),
  };
}

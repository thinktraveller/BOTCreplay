import type { ReplayDocument } from '../domain/contracts.js';
import type { ReplayProjection } from '../domain/projection.js';
import { projectReplay } from '../domain/projection.js';
import { formatEventText, formatPlayerIdentity, formatSubject } from '../domain/format.js';
import type { ReplayPresentation } from './types.js';

export function presentReplay(document: ReplayDocument, projection: ReplayProjection = projectReplay(document)): ReplayPresentation {
  const events = new Map(document.events.map(x => [x.eventId, x]));
  return {
    replayId: document.replayId, revision: document.revision, title: document.title,
    phases: [...document.phases].sort((a, b) => a.order - b.order).map(phase => ({ phaseId: phase.phaseId, label: phase.kind === 'preparation' ? '准备' : `第${phase.number}${phase.kind === 'night' ? '夜' : '天'}` })),
    assets: Object.fromEntries(document.assets.map(asset => [asset.assetId, { label: asset.placeholderLabel }])),
    events: projection.events.map(snapshot => {
      const event = events.get(snapshot.eventId)!;
      const parts = formatSubject(event.subject, snapshot.before);
      const content = formatEventText(event, snapshot.before, snapshot.after);
      const subject = event.subject;
      const player = subject.kind === 'player' ? snapshot.before.players.find(x => x.playerId === subject.playerId) : undefined;
      return {
        eventId: event.eventId, phaseId: event.phaseId, subject: parts.map(x => x.text).join(''), subjectParts: parts,
        alignment: player?.alignment ?? 'good', text: [content.action, content.information, ...content.effects].filter(Boolean).join('；'),
        details: [event.note, event.exceptionReason ? `特殊裁决：${event.exceptionReason}` : '', `因果来源：${event.causes.map(x => x.eventId).join('、') || '无'}`, `关联后果：${event.relatedEffectIds.join('、') || '无'}`].filter(Boolean).join('\n'),
        iconAssetId: player?.actualRole.iconAssetId,
        players: [...snapshot.before.players].sort((a, b) => a.seat - b.seat).map(player => ({ playerId: player.playerId, seat: player.seat, nickname: player.nickname, identity: formatPlayerIdentity(player, snapshot.before), alignment: player.alignment, alive: player.life.actuallyAlive })),
      };
    }),
  };
}

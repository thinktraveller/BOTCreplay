import type { ActionMode, EffectOperation, JsonValue, ReplayEvent, StateSnapshot, Subject } from './contracts.js';
import { requireFact } from './errors.js';
import { playerById, validateSubject } from './state.js';

export interface PlayerSelectionConstraint {
  min: number;
  max: number;
  distinct: boolean;
  life?: 'alive' | 'dead';
  lifeBasis?: 'actual' | 'treated';
  excludePlayerIds?: string[];
  allowedPlayerIds?: string[];
}
// Common primitives take an explicit constraint. They do not bind unreviewed role-specific rules.
export function validatePlayerSelection(state: StateSnapshot, selected: string[], constraint: PlayerSelectionConstraint, exceptionReason?: string): { exceptions: string[] } {
  requireFact(Number.isSafeInteger(constraint.min) && Number.isSafeInteger(constraint.max) && constraint.min >= 0 && constraint.max >= constraint.min, 'invalid-constraint', '选人约束须有有效的非负整数上下限');
  selected.forEach(id => playerById(state, id));
  const failures: string[] = [];
  if (selected.length < constraint.min || selected.length > constraint.max) failures.push(`目标数量须为${constraint.min}～${constraint.max}`);
  if (constraint.distinct && new Set(selected).size !== selected.length) failures.push('目标不能重复');
  for (const id of selected) {
    const player = playerById(state, id);
    const alive = constraint.lifeBasis === 'treated' ? player.life.treatedAsAlive : player.life.actuallyAlive;
    if (constraint.life && alive !== (constraint.life === 'alive')) failures.push(`${id}不符合${constraint.lifeBasis === 'treated' ? '被当作' : '真实'}生死限制`);
    if (constraint.excludePlayerIds?.includes(id)) failures.push(`${id}属于排除目标`);
    if (constraint.allowedPlayerIds && !constraint.allowedPlayerIds.includes(id)) failures.push(`${id}不在允许目标集中`);
  }
  requireFact(!failures.length || !!exceptionReason?.trim(), 'selection-constraint', failures.join('；'));
  return { exceptions: failures };
}
export interface RecordedActionDraft {
  subject: Subject;
  mode: ActionMode;
  abilityInstanceId?: string;
  abilityOrigin?: ReplayEvent['abilityOrigin'];
  roleChange?: ReplayEvent['roleChange'];
  roleChangeResultId?: string;
  targetPlayerIds: string[];
  action: { name: string; input: { [key: string]: JsonValue } };
  receivedInformation: JsonValue;
  effects: EffectOperation[];
}
export function createRecordedEvent(draft: RecordedActionDraft, metadata: Pick<ReplayEvent, 'eventId' | 'phaseId' | 'order' | 'visibility' | 'recipients' | 'note'> & Partial<Pick<ReplayEvent, 'relatedEffectIds' | 'causes' | 'exceptionReason'>>, state: StateSnapshot): ReplayEvent {
  validateSubject(state, draft.subject);
  draft.targetPlayerIds.forEach(id => playerById(state, id));
  const event: ReplayEvent = structuredClone({ ...draft, ...metadata, relatedEffectIds: metadata.relatedEffectIds ?? [], causes: metadata.causes ?? [] });
  // Action, information and declared effects are independent facts, never inferred from one another.
  return event;
}

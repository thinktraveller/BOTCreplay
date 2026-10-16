import type { CustomRecord, ReplayEvent } from './contracts.js';
import type { RecordedActionDraft } from './drafts.js';
import { requireFact } from './errors.js';

export const CUSTOM_CHOICE = Object.freeze({ kind: 'custom' as const, label: '自定义' as const });
// Every hierarchy uses the same option provider, including branches added later.
export function withCustomOption<T>(presets: readonly T[]): (T | typeof CUSTOM_CHOICE)[] {
  return [...presets, CUSTOM_CHOICE];
}
export function validateCustomRecords(records: CustomRecord[] = []): void {
  requireFact(new Set(records.map(record => record.part)).size === records.length, 'custom-part', '同一成句部分的自定义应合并为一份原文');
  for (const record of records) {
    requireFact(record.choice === '自定义' && record.branchPath.length > 0 && record.branchPath.every(part => !!part.trim()), 'custom-path', '自定义须保留完整分支上下文');
    requireFact(!!record.text.trim(), 'custom-empty', '请填写自定义正文');
  }
}
export interface RecordingDraft {
  selection: 'preset' | 'custom';
  preset: RecordedActionDraft;
  custom: CustomRecord;
  // These effects are separately confirmed; preset effects never leak into custom text.
  customEffects: ReplayEvent['effects'];
  customRoleChange?: ReplayEvent['roleChange'];
}
export function switchRecordingDraft(draft: RecordingDraft, selection: RecordingDraft['selection']): RecordingDraft {
  return { ...structuredClone(draft), selection };
}
export function selectedRecordingDraft(draft: RecordingDraft): RecordedActionDraft {
  if (draft.selection === 'preset') return structuredClone(draft.preset);
  validateCustomRecords([draft.custom]);
  const { subject, mode, abilityInstanceId, abilityOrigin, targetPlayerIds } = structuredClone(draft.preset);
  return { subject, mode, ...(abilityInstanceId ? { abilityInstanceId } : {}), ...(abilityOrigin ? { abilityOrigin } : {}), targetPlayerIds,
    action: { name: '自定义', input: {} }, receivedInformation: null, customRecords: [structuredClone(draft.custom)], effects: structuredClone(draft.customEffects),
    ...(draft.customRoleChange ? { roleChange: structuredClone(draft.customRoleChange) } : {}) };
}

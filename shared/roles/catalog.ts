import sourceData from './source-data.json' with { type: 'json' };
import proposalData from './action-proposals.json' with { type: 'json' };
import overrideData from './rule-overrides.json' with { type: 'json' };
import type { RuleReference } from '../domain/contracts.js';
import type { ActionProposal, RuleOverride, SourceRole } from './types.js';

export const roleSourceManifest = Object.freeze(sourceData.manifest);
// Export copies so callers cannot mutate the application catalogue across replays.
const sources = new Map((sourceData.roles as SourceRole[]).map(role => [role.id, role]));
const proposals = new Map((proposalData as ActionProposal[]).map(role => [role.roleId, role]));
const overrides = new Map((overrideData as RuleOverride[]).map(rule => [rule.roleId, rule]));
export const supportedRoleIds: readonly string[] = Object.freeze([...sources.keys()]);
export function getSourceRole(exactId: string): SourceRole | undefined {
  const role = sources.get(exactId);
  return role ? structuredClone(role) : undefined;
}
export function getActionProposal(exactId: string): ActionProposal | undefined {
  const proposal = proposals.get(exactId);
  return proposal ? structuredClone(proposal) : undefined;
}
export function getRuleOverride(exactId: string): RuleOverride | undefined {
  const rule = overrides.get(exactId);
  return rule ? structuredClone(rule) : undefined;
}
export function getCurrentRule(exactId: string): RuleReference | undefined {
  const raw = sources.get(exactId);
  const proposal = proposals.get(exactId);
  if (!raw || !proposal) return undefined;
  const override = overrides.get(exactId);
  return {
    roleId: exactId,
    roleName: raw.name,
    version: override?.version ?? 'source-v1',
    abilityText: override?.abilityText ?? raw.ability,
    source: override?.decisionSource ?? `${sourceData.manifest.sourcePath}#${proposal.entryId}`,
    actionReview: { proposalVersion: proposal.proposalVersion, status: proposal.review.status },
  };
}
export function getExcludedRoles() { return structuredClone(sourceData.excluded); }
export function getRoleCoverage() {
  const byType = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const role of sources.values()) byType[role.team]++;
  return { supported: sources.size, byType, excluded: sourceData.excluded.length, proposals: proposals.size, approved: [...proposals.values()].filter(x => x.review.status === 'approved').length, implemented: [...proposals.values()].filter(x => x.review.implementation === 'implemented').length };
}
// Aliases require explicit source verification; names and normalized IDs never bind automatically.
export const verifiedRoleAliases: Readonly<Record<string, string>> = Object.freeze({});
export function resolveExactRoleId(id: string): string | undefined { return sources.has(id) ? id : verifiedRoleAliases[id]; }

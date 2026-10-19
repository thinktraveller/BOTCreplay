import sourceData from './source-data.json' with { type: 'json' };
import proposalData from './action-proposals.json' with { type: 'json' };
import overrideData from './rule-overrides.json' with { type: 'json' };
import scopeData from './role-scope.json' with { type: 'json' };
import type { RuleReference } from '../domain/contracts.js';
import type { ActionProposal, RuleOverride, SourceRole } from './types.js';
import { roleName, renameCurrentText } from './names.js';

export const roleSourceManifest = Object.freeze(sourceData.manifest);
// Export copies so callers cannot mutate the application catalogue across replays.
const sources = new Map((sourceData.roles as SourceRole[]).map(role => [role.id, role]));
const proposals = new Map((proposalData as ActionProposal[]).map(role => [role.roleId, role]));
const overrides = new Map((overrideData as RuleOverride[]).map(rule => [rule.roleId, rule]));
const retiredIds = new Set(scopeData.retired.map(role => role.roleId));
export const supportedRoleIds: readonly string[] = Object.freeze([...sources.keys()].filter(id => !retiredIds.has(id)));
const roleNameIds = new Map<string,string[]>();
for (const id of supportedRoleIds) { const name=roleName(sources.get(id)!.name); roleNameIds.set(name,[...(roleNameIds.get(name)??[]),id]); }
export function isRoleActive(exactId: string): boolean { return sources.has(exactId) && !retiredIds.has(exactId); }
export function getArchivedSourceRole(exactId: string): SourceRole | undefined {
  const role = sources.get(exactId);
  return role ? structuredClone(role) : undefined;
}
export function getSourceRole(exactId: string): SourceRole | undefined {
  const role = isRoleActive(exactId) ? getArchivedSourceRole(exactId) : undefined;
  return role ? renameCurrentText({ ...role, name: roleName(role.name) }) : undefined;
}
export function getSourceRolesByName(name: string): SourceRole[] {
  return (roleNameIds.get(roleName(name))??[]).map(id=>getSourceRole(id)!);
}
export function getArchivedActionProposal(exactId: string): ActionProposal | undefined {
  const proposal = proposals.get(exactId);
  return proposal ? structuredClone(proposal) : undefined;
}
export function getActionProposal(exactId: string): ActionProposal | undefined {
  const proposal = isRoleActive(exactId) ? getArchivedActionProposal(exactId) : undefined;
  return proposal ? renameCurrentText(proposal) : undefined;
}
export function getRuleOverride(exactId: string): RuleOverride | undefined {
  const rule = overrides.get(exactId);
  return rule ? structuredClone(rule) : undefined;
}
export function getCurrentRule(exactId: string): RuleReference | undefined {
  const rule = isRoleActive(exactId) ? getArchivedRule(exactId) : undefined;
  return rule ? { ...rule, roleName: roleName(rule.roleName!) } : undefined;
}
// Historical replay facts remain readable even after a role is removed from new games.
export function getArchivedRule(exactId: string): RuleReference | undefined {
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
export function getRetiredRoles() { return structuredClone(scopeData.retired); }
export function getExcludedRoles() { return [...structuredClone(sourceData.excluded), ...scopeData.retired.map(item => ({ roleId:item.roleId,reason:item.reason,raw:getArchivedSourceRole(item.roleId)! }))]; }
export function getRoleCoverage() {
  const byType = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const id of supportedRoleIds) byType[sources.get(id)!.team]++;
  const activeProposals = [...proposals.values()].filter(item=>isRoleActive(item.roleId));
  return { supported: supportedRoleIds.length, archived: sources.size, retired:retiredIds.size, byType, excluded: sourceData.excluded.length+retiredIds.size, proposals: activeProposals.length, approved: activeProposals.filter(x => x.review.status === 'approved').length, implemented: activeProposals.filter(x => x.review.implementation === 'implemented').length };
}
// Aliases require explicit source verification; names and normalized IDs never bind automatically.
// Verified against townsquare/src/roles.json at b8f8e84c5a34e5a402fd7cbc96f8a332366f427d
// by ability, team and source icon filename. Keep the local rule/review versions.
export const verifiedRoleAliases: Readonly<Record<string, string>> = Object.freeze({
  yinyangshi: 'yinyangshiqidong111',
  bianlianshi: 'chaojibianbianbian111',
  alsaahir: 'xixifafashishishishishishishi',
  drunk: 'woheduolema111',
  cerenovus: 'xixi111111111111',
});
export function resolveExactRoleId(id: string): string | undefined {
  if (isRoleActive(id)) return id;
  const target = Object.hasOwn(verifiedRoleAliases, id) ? verifiedRoleAliases[id] : undefined;
  return target && isRoleActive(target) ? target : undefined;
}

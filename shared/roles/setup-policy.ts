import scope from './role-scope.json' with { type:'json' };
import { isRoleActive } from './catalog.js';

export interface SetupAdjustment { sourceRoleId:string; target:'outsider'|'minion'|'fixed-role'; description:string; amount?:number }
// This policy suppresses quantity adjustments only. It does not invent a final
// setup, choose priority between simultaneous overrides, or change fixed roles.
export function resolveSetupAdjustments(activeRoleIds:readonly string[],adjustments:readonly SetupAdjustment[]) {
  const active = new Set(activeRoleIds);
  for (const id of active) if (!isRoleActive(id)) throw new Error('配版包含当前已移除或未知的角色');
  const overridingRoleIds=scope.setupOutsiderOverrideRoleIds.filter(id=>active.has(id));
  const accepted:SetupAdjustment[]=[],suppressed:SetupAdjustment[]=[];
  for (const item of adjustments) {
    if (!active.has(item.sourceRoleId)||!item.description.trim()||(item.amount!==undefined&&!Number.isSafeInteger(item.amount))) throw new Error('配版调整需要在场来源、完整说明及有效整数数量');
    const overridden=overridingRoleIds.length>0&&item.target==='outsider'&&!overridingRoleIds.includes(item.sourceRoleId);
    (overridden?suppressed:accepted).push(structuredClone(item));
  }
  return {accepted,suppressed,overridingRoleIds,requiresExplicitFinalCount:overridingRoleIds.length>0};
}

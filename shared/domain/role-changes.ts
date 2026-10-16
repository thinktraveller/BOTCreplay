import type { EffectOperation, EventSnapshot, ReplayEvent, RoleChangeAction, RoleMapping, RoleReference, StateSnapshot } from './contracts.js';
import { requireFact } from './errors.js';
import { abilityById, playerById, uniqueIds } from './state.js';

export function sameRole(a: RoleReference, b: RoleReference): boolean {
  return a.roleId === b.roleId && a.ruleVersion === b.ruleVersion && a.name === b.name && a.type === b.type;
}

// Draft diagnostics do not mutate or discard partially filled input. Role-specific target
// restrictions remain in the separately reviewed role template.
export function inspectRoleChangeDraft(action: RoleChangeAction, state: StateSnapshot, changes: RoleMapping[] = [], requireAlignments = true): string[] {
  const issues: string[] = [];
  const selected = action.selectedPlayerIds;
  const affected = action.affectedPlayerIds ?? selected;
  if (new Set(selected).size !== selected.length) issues.push('目标不能重复');
  if (new Set(affected).size !== affected.length) issues.push('受影响玩家不能重复');
  for (const id of selected) if (!state.players.some(player => player.playerId === id)) issues.push('找不到所选玩家');
  for (const id of affected) if (!state.players.some(player => player.playerId === id)) issues.push('找不到受影响玩家');
  if (action.status === 'not-used') {
    if (selected.length || affected.length || changes.length || action.resultId) issues.push('不使用时不填写目标或成功结果');
    return issues;
  }
  if (!selected.length) issues.push('选择或触发须填写本次玩家');
  if (action.status !== 'applied') {
    if (changes.length || action.resultId) issues.push('仅选择或未生效时不能声明成功映射');
    return issues;
  }
  if (!action.resultId?.trim()) issues.push('实际生效须有唯一结果标识');
  if (!affected.length || changes.length !== affected.length || new Set(changes.map(item => item.playerId)).size !== changes.length || changes.some(item => !affected.includes(item.playerId))) issues.push('实际生效须填写全部受影响玩家的唯一前后映射');
  for (const change of changes) {
    const player = state.players.find(item => item.playerId === change.playerId);
    if (!player || !sameRole(player.actualRole, change.from)) issues.push('旧角色与实际生效前的角色不一致');
    if (requireAlignments && (change.fromAlignment === undefined || change.toAlignment === undefined)) issues.push('请在每名玩家的新角色之后明确选择当前阵营');
    if (change.fromAlignment !== undefined && player?.alignment !== change.fromAlignment) issues.push('旧阵营与实际生效前的阵营不一致');
    if ((change.fromAlignment === undefined) !== (change.toAlignment === undefined)) issues.push('角色变化须完整保存前后实际阵营');
  }
  if (action.kind === 'exchange' && (changes.length !== 2 || !sameRole(changes[0]!.to, changes[1]!.from) || !sameRole(changes[1]!.to, changes[0]!.from))) issues.push('交换须有相互对应的双向角色映射');
  return issues;
}

export function resolveAbilityOrigin(event: ReplayEvent, before: StateSnapshot, snapshots: EventSnapshot[]): EventSnapshot['abilityOrigin'] {
  const origin = event.abilityOrigin;
  if (!origin) return undefined;
  const previous = snapshots.find(item => item.eventId === origin.eventId);
  const sourceState = origin.eventId === event.eventId && origin.timing === 'before' ? before : previous?.[origin.timing];
  requireFact(sourceState, 'origin-event', '能力来源须引用当前事件之前或已发生事件的明确快照', event.eventId);
  requireFact(event.causes.some(item => item.eventId === origin.eventId), 'origin-cause', '触发时能力来源须同时登记因果引用', event.eventId);
  const player = playerById(sourceState, origin.playerId);
  if (origin.abilityInstanceId) {
    const ability = abilityById(sourceState, origin.abilityInstanceId);
    requireFact(ability.holder.kind === 'player' && ability.holder.playerId === origin.playerId && ability.mode === 'real' && ability.rule.roleId === origin.role.roleId && ability.rule.version === origin.role.ruleVersion, 'origin-ability', '来源能力与触发时的真实持有者及规则版本不一致', event.eventId);
  } else {
    requireFact(sameRole(player.actualRole, origin.role), 'origin-role', '来源角色须使用触发时角色；获得能力请关联对应实例', event.eventId);
  }
  return { playerId: origin.playerId, role: structuredClone(origin.role), state: structuredClone(sourceState) };
}

export function validateRoleChangeEvent(event: ReplayEvent, before: StateSnapshot, snapshots: EventSnapshot[], requireAlignments = true): void {
  const changes = event.effects.filter((effect): effect is Extract<EffectOperation, { kind: 'change-roles' }> => effect.kind === 'change-roles');
  const actualRoles = event.effects.filter(effect => effect.kind === 'set-role' && effect.perception === 'actual');
  requireFact(!changes.length || !!event.roleChange, 'role-change-action', '换角效果须关联实际选择及结果状态', event.eventId);
  if (event.roleChange) {
    requireFact(!event.roleChangeResultId && !actualRoles.length && changes.length <= 1, 'role-change-owner', '一次角色变化使用一份完整映射，引用入口不得再次声明换角', event.eventId);
    const action = event.roleChange;
    const effect = changes[0];
    const issues = inspectRoleChangeDraft(action, before, effect?.changes, requireAlignments);
    requireFact(!issues.length, 'role-change-input', issues.join('；'), event.eventId);
    requireFact(action.status !== 'applied' || effect && action.resultId === effect.resultId && action.kind === effect.changeKind, 'role-change-result', '实际生效须关联本事件中一致的换角效果', event.eventId);
    requireFact(action.status === 'applied' || !effect, 'role-change-status', '未使用、仅选择或未生效不能改变角色', event.eventId);
    const affected = new Set(effect?.changes.map(change => change.playerId));
    requireFact(!requireAlignments || !event.effects.some(item => item.kind === 'set-alignment' && affected.has(item.playerId)), 'role-change-alignment', '本次换角涉及的阵营须与角色写入同一映射，不重复声明阵营效果', event.eventId);
  }
  requireFact(!requireAlignments || !actualRoles.length, 'role-change-alignment', '当前版本的实际角色变化请同时填写角色和阵营映射', event.eventId);
  if (event.roleChangeResultId) {
    const result = snapshots.flatMap(item => item.roleChangeResults ?? []).find(item => item.resultId === event.roleChangeResultId);
    requireFact(result, 'role-change-reference', '关联的换角结果尚未发生', event.eventId);
    requireFact(!changes.length && !actualRoles.length && event.relatedEffectIds.includes(result.effectId), 'role-change-reference', '逐人展示须引用原效果，不得重新执行换角', event.eventId);
  }
  uniqueIds(changes.map(effect => effect.resultId), 'role-change.result');
}

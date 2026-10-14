import type { AbilityInstance, ConditionInstance, Id, PlayerState, StateSnapshot, Subject } from './contracts.js';
import { requireFact } from './errors.js';

export function uniqueIds(values: string[], reference: string): void {
  requireFact(new Set(values).size === values.length, 'duplicate-id', `存在重复的标识或顺序：${reference}`, reference);
}
export function playerById(state: StateSnapshot, id: Id): PlayerState {
  const player = state.players.find(item => item.playerId === id);
  requireFact(player, 'missing-player', `找不到玩家 ${id}`, id);
  return player;
}
export function abilityById(state: StateSnapshot, id: Id): AbilityInstance {
  const ability = state.abilities.find(item => item.abilityInstanceId === id);
  requireFact(ability, 'missing-ability', `找不到能力实例 ${id}`, id);
  return ability;
}
export function conditionById(state: StateSnapshot, id: Id): ConditionInstance {
  const condition = state.conditions.find(item => item.conditionId === id);
  requireFact(condition, 'missing-condition', `找不到状态来源 ${id}`, id);
  return condition;
}
export function validateSubject(state: StateSnapshot, subject: Subject): void {
  if (subject.kind === 'player') playerById(state, subject.playerId);
  if (subject.kind === 'group') { uniqueIds(subject.playerIds, subject.name); for (const id of subject.playerIds) playerById(state, id); }
}
export function sameSubject(a: Subject, b: Subject): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'player' && b.kind === 'player') return a.playerId === b.playerId;
  if (a.kind === 'storyteller' && b.kind === 'storyteller') return a.name === b.name;
  return a.kind === 'group' && b.kind === 'group' && a.name === b.name && a.playerIds.length === b.playerIds.length && a.playerIds.every(id => b.playerIds.includes(id));
}
export function validateUsage(usage: AbilityInstance['usage'], reference: Id): void {
  requireFact(usage.limit === undefined || usage.used <= usage.limit, 'usage-over-limit', '能力使用次数超过已登记上限', reference);
  requireFact(usage.state !== 'unused' || usage.used === 0, 'usage-state', '未使用能力的已用次数须为0', reference);
  requireFact(usage.state !== 'consumed' || usage.limit === undefined || usage.used === usage.limit, 'usage-state', '有限次能力耗尽状态与实际消耗次数不一致', reference);
  uniqueIds(usage.evidenceEventIds, reference);
}
export function validateState(state: StateSnapshot, recomputeLife = false): void {
  uniqueIds(state.players.map(x => x.playerId), 'players');
  uniqueIds(state.players.map(x => String(x.seat)), 'seats');
  uniqueIds(state.abilities.map(x => x.abilityInstanceId), 'abilities');
  uniqueIds(state.conditions.map(x => x.conditionId), 'conditions');
  uniqueIds(state.pendingTriggers.map(x => x.triggerId), 'triggers');
  for (const player of state.players) {
    uniqueIds(player.abilityInstanceIds, player.playerId);
    uniqueIds(player.conditionIds, player.playerId);
    uniqueIds(player.reminders.map(x => x.reminderId), player.playerId);
    for (const reminder of player.reminders) if (reminder.source?.abilityInstanceId) abilityById(state, reminder.source.abilityInstanceId);
    for (const id of player.abilityInstanceIds) {
      const ability = abilityById(state, id);
      requireFact(ability.holder.kind === 'player' && ability.holder.playerId === player.playerId, 'ability-holder', '玩家能力索引与持有者不一致', id);
    }
    for (const id of player.conditionIds) requireFact(conditionById(state, id).targetPlayerId === player.playerId, 'condition-target', '状态索引与目标玩家不一致', id);
    const active = state.conditions.filter(x => x.active && x.targetPlayerId === player.playerId);
    const lifeConditions = active.filter(x => x.kind === 'zombuul-alive' || x.kind === 'falsely-dead');
    requireFact(!(lifeConditions.some(x => x.kind === 'zombuul-alive') && lifeConditions.some(x => x.kind === 'falsely-dead')), 'opposing-life-conditions', '活尸与假死抵消须在同一事件中明确记录两个来源的解除', player.playerId);
    requireFact(!lifeConditions.some(x => x.kind === 'zombuul-alive') || !player.life.actuallyAlive, 'zombie-life', '活尸须实际死亡；复活时须明确解除活尸来源', player.playerId);
    requireFact(!lifeConditions.some(x => x.kind === 'falsely-dead') || player.life.actuallyAlive, 'false-life', '假死须实际存活；实际死亡时须明确解除假死来源', player.playerId);
    const expectedAlive = lifeConditions.some(x => x.kind === 'zombuul-alive') ? true : lifeConditions.some(x => x.kind === 'falsely-dead') ? false : player.life.actuallyAlive;
    if (recomputeLife) {
      player.life.treatedAsAlive = expectedAlive;
      player.life.reasonConditionIds = lifeConditions.map(x => x.conditionId);
    } else {
      requireFact(player.life.treatedAsAlive === expectedAlive, 'life-registration', '真实生死与活尸/假死来源不能重建被当作生死', player.playerId);
      requireFact(player.life.reasonConditionIds.length === lifeConditions.length && lifeConditions.every(x => player.life.reasonConditionIds.includes(x.conditionId)), 'life-source', '被当作生死的来源索引不一致', player.playerId);
    }
  }
  for (const ability of state.abilities) {
    validateSubject(state, ability.holder);
    validateUsage(ability.usage, ability.abilityInstanceId);
    if (ability.source?.abilityInstanceId) abilityById(state, ability.source.abilityInstanceId);
    if (ability.holder.kind === 'player') requireFact(playerById(state, ability.holder.playerId).abilityInstanceIds.includes(ability.abilityInstanceId), 'ability-index', '能力持有者缺少实例索引', ability.abilityInstanceId);
    const seen = new Set([ability.abilityInstanceId]);
    let parent = ability.parentAbilityInstanceId;
    while (parent) {
      requireFact(!seen.has(parent), 'ability-cycle', '能力父来源形成循环', parent);
      seen.add(parent);
      const ancestor = abilityById(state, parent);
      requireFact(ancestor.mode !== 'perceived' || ability.mode === 'perceived', 'perceived-parent', '认知父能力不能自动产生真实子能力', ability.abilityInstanceId);
      parent = ancestor.parentAbilityInstanceId;
    }
  }
  for (const condition of state.conditions) {
    requireFact(playerById(state, condition.targetPlayerId).conditionIds.includes(condition.conditionId), 'condition-index', '状态目标缺少来源索引', condition.conditionId);
    if (condition.source.abilityInstanceId) abilityById(state, condition.source.abilityInstanceId);
    if (condition.registration?.appliesToAbilityInstanceId) abilityById(state, condition.registration.appliesToAbilityInstanceId);
    requireFact(condition.kind === 'registration' || !condition.registration, 'registration-kind', '识别字段只能属于特殊识别状态', condition.conditionId);
    requireFact(!condition.active || !condition.endedByEventId, 'condition-ended', '已解除状态不能同时生效', condition.conditionId);
  }
  for (const trigger of state.pendingTriggers) {
    uniqueIds(trigger.targetPlayerIds, trigger.triggerId);
    for (const id of trigger.targetPlayerIds) playerById(state, id);
    requireFact(trigger.state === 'cancelled' || ((trigger.remaining === 0) === (trigger.state === 'settled')), 'trigger-state', '待结算次数和状态不一致', trigger.triggerId);
    requireFact(trigger.state !== 'partly-settled' || trigger.settlements.length > 0, 'trigger-state', '部分结算状态缺少结算记录', trigger.triggerId);
    requireFact(trigger.state !== 'settled' || trigger.settlements.length > 0, 'trigger-state', '已结算触发缺少实际结算记录', trigger.triggerId);
    requireFact(trigger.state !== 'pending' || trigger.settlements.length === 0, 'trigger-state', '已有消费记录的触发不能仍为未结算状态', trigger.triggerId);
    uniqueIds(trigger.settlements.flatMap(x => x.effectIds), trigger.triggerId);
    if (trigger.source.abilityInstanceId) abilityById(state, trigger.source.abilityInstanceId);
  }
}
export function registrationCandidates(state: StateSnapshot, playerId: Id, abilityInstanceId?: Id): ConditionInstance[] {
  playerById(state, playerId);
  return structuredClone(state.conditions.filter(x => x.active && x.kind === 'registration' && x.targetPlayerId === playerId && (!x.registration?.appliesToAbilityInstanceId || x.registration.appliesToAbilityInstanceId === abilityInstanceId)));
}

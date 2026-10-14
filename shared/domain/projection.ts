import type { CausalSource, EffectOperation, EventPoint, EventSnapshot, Expiry, Id, Phase, ReplayDocument, ReplayEvent, StateSnapshot } from './contracts.js';
import { requireFact } from './errors.js';
import { abilityById, conditionById, playerById, sameSubject, uniqueIds, validateState, validateSubject, validateUsage } from './state.js';
import { validateReplayStructure } from '../schemas/validate.js';
import { abilityAvailability } from './abilities.js';

export interface PhaseSnapshot { phaseId: Id; before: StateSnapshot; after: StateSnapshot; eventIds: Id[] }
export interface ReplayProjection { state: StateSnapshot; events: EventSnapshot[]; phases: PhaseSnapshot[] }

export function projectReplay(input: ReplayDocument): ReplayProjection {
  const parsed = validateReplayStructure(input);
  requireFact(parsed.valid, 'invalid-structure', parsed.valid ? '' : parsed.errors.map(x => `${x.path}: ${x.message}`).join('; '));
  const document = structuredClone(input);
  uniqueIds(document.phases.map(x => x.phaseId), 'phases');
  uniqueIds(document.phases.map(x => String(x.order)), 'phase.order');
  uniqueIds(document.events.map(x => x.eventId), 'events');
  uniqueIds(document.assets.map(x => x.assetId), 'assets');
  uniqueIds(document.rules.map(x => `${x.roleId}/${x.version}`), 'rules');
  uniqueIds(document.script.roles.map(x => x.role.roleId), 'script.roles');
  uniqueIds(document.events.flatMap(x => x.effects.map(y => y.effectId)), 'effects');
  const phaseMap = new Map(document.phases.map(x => [x.phaseId, x]));
  const eventMap = new Map(document.events.map(x => [x.eventId, x]));
  const declaredTriggerIds = new Set([...document.initialState.pendingTriggers.map(x => x.triggerId), ...document.events.flatMap(event => event.effects.filter((x): x is Extract<EffectOperation, { kind: 'schedule-trigger' }> => x.kind === 'schedule-trigger').map(x => x.trigger.triggerId))]);
  for (const event of document.events) {
    requireFact(phaseMap.has(event.phaseId), 'missing-phase', '事件引用了不存在的阶段', event.eventId);
    uniqueIds(event.effects.map(x => String(x.order)), `${event.eventId}.effect.order`);
  }
  const validatePoint = (point: EventPoint) => {
    requireFact(phaseMap.has(point.phaseId), 'missing-phase', '时点引用了不存在的阶段', point.phaseId);
    if (point.eventId) requireFact(eventMap.get(point.eventId)?.phaseId === point.phaseId, 'invalid-point', '事件时点与阶段不一致', point.eventId);
  };
  const validateExpiry = (expires?: Expiry) => {
    if (expires?.kind === 'point') validatePoint(expires.point);
    if (expires?.kind === 'trigger') requireFact(declaredTriggerIds.has(expires.triggerId), 'missing-trigger', '期限引用不存在的触发', expires.triggerId);
  };
  const state = document.initialState;
  validateState(state);
  // Baseline provenance events describe initial facts and carry no effects. Replaying them must
  // not apply those facts twice. Ordinary changes are declared by subsequent event effects.
  const baselineEvent = (eventId: Id) => {
    const event = eventMap.get(eventId);
    requireFact(event && phaseMap.get(event.phaseId)?.kind === 'preparation' && event.effects.length === 0, 'baseline-source', '初始事实的来源须为文档中无效果的准备阶段事件；状态变化请使用后续effects', eventId);
  };
  for (const ability of state.abilities) {
    validatePoint(ability.startsAt); validateExpiry(ability.expires);
    if (ability.startsAt.eventId) baselineEvent(ability.startsAt.eventId);
    if (ability.source) baselineEvent(ability.source.eventId);
    ability.usage.evidenceEventIds.forEach(baselineEvent);
  }
  for (const condition of state.conditions) {
    validatePoint(condition.startsAt); validateExpiry(condition.expires); baselineEvent(condition.source.eventId);
    if (condition.startsAt.eventId) baselineEvent(condition.startsAt.eventId);
    if (condition.endedByEventId) baselineEvent(condition.endedByEventId);
  }
  for (const player of state.players) for (const reminder of player.reminders) if (reminder.source) baselineEvent(reminder.source.eventId);
  for (const trigger of state.pendingTriggers) {
    baselineEvent(trigger.source.eventId);
    for (const phaseId of [trigger.window.earliestPhaseId, trigger.window.latestPhaseId]) if (phaseId) requireFact(phaseMap.has(phaseId), 'missing-phase', '初始结算窗口引用不存在的阶段', phaseId);
    if (trigger.window.earliestPhaseId && trigger.window.latestPhaseId) requireFact(phaseMap.get(trigger.window.earliestPhaseId)!.order <= phaseMap.get(trigger.window.latestPhaseId)!.order, 'trigger-window', '初始结算窗口起止顺序错误', trigger.triggerId);
    for (const settlement of trigger.settlements) {
      baselineEvent(settlement.eventId);
      requireFact(settlement.effectIds.length === 0, 'baseline-effect', '含实际后果的初始结算须改为时间线effects重建', trigger.triggerId);
    }
  }
  const knownEvents = new Set<Id>();
  const knownEffects = new Map<Id, EffectOperation>();
  const checkSource = (source: CausalSource, eventId: Id) => {
    requireFact(source.eventId === eventId || knownEvents.has(source.eventId), 'forward-source', '因果来源须为当前或已发生的事件', source.eventId);
    if (source.abilityInstanceId) abilityById(state, source.abilityInstanceId);
  };
  const phaseSnapshots: PhaseSnapshot[] = [];
  const eventSnapshots: EventSnapshot[] = [];
  for (const phase of [...document.phases].sort((a, b) => a.order - b.order)) {
    const events = document.events.filter(x => x.phaseId === phase.phaseId).sort((a, b) => a.order - b.order);
    uniqueIds(events.map(x => String(x.order)), `${phase.phaseId}.event.order`);
    const phaseBefore = structuredClone(state);
    let executions = 0;
    for (const event of events) {
      validateSubject(state, event.subject);
      event.recipients.forEach(x => validateSubject(state, x));
      for (const id of event.targetPlayerIds ?? []) playerById(state, id);
      event.causes.forEach(x => checkSource(x, event.eventId));
      if (event.abilityInstanceId) {
        const ability = abilityById(state, event.abilityInstanceId);
        requireFact(sameSubject(ability.holder, event.subject) || !!event.exceptionReason?.trim(), 'action-holder', '动作主语与能力持有者不一致，需记录特殊裁决', event.eventId);
        requireFact(ability.mode !== 'perceived' || event.mode === 'perceived-action' || event.mode === 'manual', 'perceived-ability-mode', '认知能力不能冒充真实能力动作', event.eventId);
        if (event.mode === 'real-ability' || event.mode === 'perceived-action') {
          const deathEvent = event.causes.map(x => eventMap.get(x.eventId)).find(candidate => candidate?.effects.some(x => x.kind === 'set-life' && ability.holder.kind === 'player' && x.playerId === ability.holder.playerId && !x.actuallyAlive));
          const settlingIds = event.effects.filter((x): x is Extract<EffectOperation, { kind: 'settle-trigger' }> => x.kind === 'settle-trigger').map(x => x.triggerId);
          const trigger = state.pendingTriggers.find(x => settlingIds.includes(x.triggerId) && x.source.abilityInstanceId === ability.abilityInstanceId);
          const availability = abilityAvailability(state, ability.abilityInstanceId, { deathEvent, trigger });
          requireFact(availability.available || !!event.exceptionReason?.trim(), 'ability-unavailable', `${availability.reason}；例外须明确记录裁决`, event.eventId);
        }
      }
      const before = structuredClone(state);
      const targetIds = new Set(event.targetPlayerIds ?? []);
      for (const effect of [...event.effects].sort((a, b) => a.order - b.order)) {
        checkSource(effect.source, event.eventId);
        requireFact(effect.source.eventId === event.eventId, 'effect-owner', '效果由单一事件声明，其他入口请使用 relatedEffectIds', effect.effectId);
        if (event.mode === 'perceived-action' || event.mode === 'disguise') {
          const allowed = (effect.kind === 'set-role' && effect.perception !== 'actual') || effect.kind === 'clear-role' || effect.kind === 'set-reminder' || (effect.kind === 'grant-ability' && effect.ability.mode === 'perceived') || (effect.kind === 'update-ability' && abilityById(state, effect.abilityInstanceId).mode === 'perceived');
          requireFact(allowed, 'nonreal-effect', '认知或伪装动作不能自动产生真实效果；实际裁决应另记人工事件', effect.effectId);
        }
        if ('playerId' in effect) targetIds.add(effect.playerId);
        switch (effect.kind) {
          case 'set-role': {
            const player = playerById(state, effect.playerId);
            if (effect.perception === 'actual') player.actualRole = structuredClone(effect.role);
            if (effect.perception === 'perceived') player.perceivedRole = structuredClone(effect.role);
            if (effect.perception === 'disguise') player.disguise = structuredClone(effect.role);
            break;
          }
          case 'clear-role': {
            const player = playerById(state, effect.playerId);
            if (effect.perception === 'perceived') delete player.perceivedRole; else delete player.disguise;
            break;
          }
          case 'set-alignment': playerById(state, effect.playerId).alignment = effect.alignment; break;
          case 'set-life': playerById(state, effect.playerId).life.actuallyAlive = effect.actuallyAlive; break;
          case 'execution': {
            playerById(state, effect.playerId);
            executions++;
            requireFact((phase.kind === 'day' && executions <= 1) || !!(effect.exceptionReason?.trim() || event.exceptionReason?.trim()), 'execution-limit', '普通白天至多一名被处决；额外处决或非白天处决需保存裁决依据', effect.effectId);
            break;
          }
          case 'add-condition': {
            const condition = structuredClone(effect.condition);
            requireFact(!state.conditions.some(x => x.conditionId === condition.conditionId), 'duplicate-condition', '状态来源实例已存在', condition.conditionId);
            checkSource(condition.source, event.eventId);
            validatePoint(condition.startsAt); validateExpiry(condition.expires);
            requireFact(condition.startsAt.phaseId === event.phaseId && (!condition.startsAt.eventId || condition.startsAt.eventId === event.eventId), 'condition-start', '新增状态的起点须为当前记录时点', condition.conditionId);
            const player = playerById(state, condition.targetPlayerId);
            targetIds.add(player.playerId);
            state.conditions.push(condition); player.conditionIds.push(condition.conditionId);
            break;
          }
          case 'end-condition': {
            const condition = conditionById(state, effect.conditionId);
            requireFact(condition.active, 'condition-inactive', '状态来源已经解除，不能重复解除', condition.conditionId);
            condition.active = false; condition.endedByEventId = event.eventId; targetIds.add(condition.targetPlayerId);
            break;
          }
          case 'grant-ability': {
            const ability = structuredClone(effect.ability);
            requireFact(!state.abilities.some(x => x.abilityInstanceId === ability.abilityInstanceId), 'duplicate-ability', '能力实例已存在；重获能力须建立新实例', ability.abilityInstanceId);
            validateSubject(state, ability.holder);
            validatePoint(ability.startsAt); validateExpiry(ability.expires);
            requireFact(ability.startsAt.phaseId === event.phaseId && (!ability.startsAt.eventId || ability.startsAt.eventId === event.eventId), 'ability-start', '新增能力的起点须为当前记录时点', ability.abilityInstanceId);
            requireFact(ability.source, 'ability-source', '获得能力需要记录来源', ability.abilityInstanceId);
            checkSource(ability.source, event.eventId);
            for (const id of ability.usage.evidenceEventIds) requireFact(id === event.eventId || knownEvents.has(id), 'usage-evidence', '能力次数依据引用尚未发生的事件', id);
            if (ability.parentAbilityInstanceId) abilityById(state, ability.parentAbilityInstanceId);
            state.abilities.push(ability);
            if (ability.holder.kind === 'player') { playerById(state, ability.holder.playerId).abilityInstanceIds.push(ability.abilityInstanceId); targetIds.add(ability.holder.playerId); }
            break;
          }
          case 'update-ability': {
            const ability = abilityById(state, effect.abilityInstanceId);
            validateUsage(effect.usage, ability.abilityInstanceId);
            requireFact(effect.usage.limit === ability.usage.limit && effect.usage.used >= ability.usage.used, 'usage-reversal', '实例上限与已用次数不能倒退；重获能力请新建实例', ability.abilityInstanceId);
            requireFact(ability.usage.state !== 'lost' && (ability.usage.state !== 'consumed' || effect.usage.state === 'lost' && effect.usage.used === ability.usage.used), 'ability-unavailable', '已失去或耗尽的实例不能重新启用；耗尽后可另记失去', ability.abilityInstanceId);
            requireFact(effect.usage.evidenceEventIds.includes(event.eventId) && ability.usage.evidenceEventIds.every(id => effect.usage.evidenceEventIds.includes(id)), 'usage-evidence', '次数或资格变化须保留既有及本次来源事件', ability.abilityInstanceId);
            for (const id of effect.usage.evidenceEventIds) requireFact(id === event.eventId || knownEvents.has(id), 'usage-evidence', '能力次数依据引用尚未发生的事件', id);
            ability.usage = structuredClone(effect.usage);
            break;
          }
          case 'set-reminder': {
            const player = playerById(state, effect.playerId);
            if (effect.reminder.source) checkSource(effect.reminder.source, event.eventId);
            const old = player.reminders.find(x => x.reminderId === effect.reminder.reminderId);
            requireFact(!old || old.text === effect.reminder.text, 'reminder-identity', '同一标记实例不能改作另一标记', effect.reminder.reminderId);
            if (effect.active && !old) player.reminders.push(structuredClone(effect.reminder));
            if (!effect.active) { requireFact(old, 'missing-reminder', '待移除标记不存在', effect.reminder.reminderId); player.reminders = player.reminders.filter(x => x.reminderId !== effect.reminder.reminderId); }
            break;
          }
          case 'schedule-trigger': {
            const trigger = structuredClone(effect.trigger);
            requireFact(!state.pendingTriggers.some(x => x.triggerId === trigger.triggerId), 'duplicate-trigger', '跨阶段目标组须使用独立触发ID', trigger.triggerId);
            requireFact(trigger.remaining > 0 && trigger.state === 'pending' && trigger.settlements.length === 0, 'trigger-start', '新触发须有未消费次数且无既有结算', trigger.triggerId);
            checkSource(trigger.source, event.eventId);
            for (const id of trigger.targetPlayerIds) { playerById(state, id); targetIds.add(id); }
            for (const phaseId of [trigger.window.earliestPhaseId, trigger.window.latestPhaseId]) if (phaseId) requireFact(phaseMap.has(phaseId), 'missing-phase', '结算窗口引用不存在的阶段', phaseId);
            if (trigger.window.earliestPhaseId && trigger.window.latestPhaseId) requireFact(phaseMap.get(trigger.window.earliestPhaseId)!.order <= phaseMap.get(trigger.window.latestPhaseId)!.order, 'trigger-window', '结算窗口起止顺序错误', trigger.triggerId);
            state.pendingTriggers.push(trigger);
            break;
          }
          case 'settle-trigger': {
            const trigger = state.pendingTriggers.find(x => x.triggerId === effect.triggerId);
            requireFact(trigger, 'missing-trigger', '找不到待结算链', effect.triggerId);
            requireFact(trigger.state === 'pending' || trigger.state === 'partly-settled', 'trigger-unavailable', '此触发已结算或取消，不能再次消费', trigger.triggerId);
            requireFact(effect.consumed <= trigger.remaining, 'trigger-overconsume', '本次消耗超过剩余触发次数', trigger.triggerId);
            const earliest = trigger.window.earliestPhaseId ? phaseMap.get(trigger.window.earliestPhaseId)!.order : -Infinity;
            const latest = trigger.window.latestPhaseId ? phaseMap.get(trigger.window.latestPhaseId)!.order : Infinity;
            requireFact(phase.order >= earliest && phase.order <= latest || !!event.exceptionReason?.trim(), 'trigger-window', '结算发生在登记窗口之外，需明确裁决说明', trigger.triggerId);
            for (const id of effect.effectIds) {
              requireFact(knownEffects.has(id), 'missing-effect', '结算后果须在本事件先声明或已由先前事件声明', id);
              requireFact(!trigger.settlements.some(x => x.effectIds.includes(id)), 'duplicate-settlement', '同一触发不能重复消费同一后果', id);
            }
            trigger.remaining -= effect.consumed;
            trigger.state = trigger.remaining ? 'partly-settled' : 'settled';
            trigger.settlements.push({ eventId: event.eventId, consumed: effect.consumed, effectIds: [...effect.effectIds] });
            break;
          }
          case 'cancel-trigger': {
            const trigger = state.pendingTriggers.find(x => x.triggerId === effect.triggerId);
            requireFact(trigger && (trigger.state === 'pending' || trigger.state === 'partly-settled'), 'trigger-unavailable', '只能取消待结算触发', effect.triggerId);
            trigger.state = 'cancelled';
            // The cancellation event retains its reason; target groups and settlements stay intact.
            break;
          }
        }
        knownEffects.set(effect.effectId, effect);
      }
      for (const effectId of event.relatedEffectIds) requireFact(knownEffects.has(effectId), 'missing-effect', '关联后果尚未声明', effectId);
      validateState(state, true);
      eventSnapshots.push({ eventId: event.eventId, before, after: structuredClone(state), targetPlayerIds: [...targetIds] });
      knownEvents.add(event.eventId);
    }
    phaseSnapshots.push({ phaseId: phase.phaseId, before: phaseBefore, after: structuredClone(state), eventIds: events.map(x => x.eventId) });
  }
  if (document.finalDecision) requireFact(knownEvents.has(document.finalDecision.eventId), 'missing-event', '最终裁决引用不存在的事件', document.finalDecision.eventId);
  return { state: structuredClone(state), events: eventSnapshots, phases: phaseSnapshots };
}

// Expiry is a reminder only. The storyteller records an explicit end-condition or ability loss.
export function dueExpirations(state: StateSnapshot, point: EventPoint, phases: Phase[], events: ReplayEvent[]): { kind: 'condition' | 'ability'; id: Id; expiry: Expiry }[] {
  const position = (p: EventPoint) => {
    const phase = phases.find(x => x.phaseId === p.phaseId);
    requireFact(phase, 'missing-phase', '期限时点缺少阶段', p.phaseId);
    const event = p.eventId ? events.find(x => x.eventId === p.eventId && x.phaseId === p.phaseId) : undefined;
    requireFact(!p.eventId || event, 'invalid-point', '期限时点与事件不一致', p.eventId);
    return [phase.order, event?.order ?? -1];
  };
  const now = position(point);
  const due = (expiry?: Expiry): expiry is Expiry => {
    if (expiry?.kind !== 'point') return false;
    const then = position(expiry.point);
    return then[0] < now[0] || then[0] === now[0] && then[1] <= now[1];
  };
  return [
    ...state.conditions.filter(x => x.active && due(x.expires)).map(x => ({ kind: 'condition' as const, id: x.conditionId, expiry: structuredClone(x.expires!) })),
    ...state.abilities.filter(x => x.usage.state !== 'lost' && x.usage.state !== 'consumed' && due(x.expires)).map(x => ({ kind: 'ability' as const, id: x.abilityInstanceId, expiry: structuredClone(x.expires!) })),
  ];
}

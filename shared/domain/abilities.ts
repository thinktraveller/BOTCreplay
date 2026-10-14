import type { AbilityInstance, PendingTrigger, ReplayEvent, StateSnapshot, Subject } from './contracts.js';
import { abilityById, playerById, sameSubject } from './state.js';

export interface AbilityContext { deathEvent?: ReplayEvent; trigger?: PendingTrigger; lifeBasis?: 'actual' | 'treated' }
export function abilityAvailability(state: StateSnapshot, abilityInstanceId: string, context: AbilityContext = {}): { available: boolean; reason: string } {
  const ability = abilityById(state, abilityInstanceId);
  if (ability.usage.state === 'lost') return { available: false, reason: '此能力实例已经失去' };
  if (ability.usage.state === 'consumed' || ability.usage.limit !== undefined && ability.usage.used >= ability.usage.limit) return { available: false, reason: '此能力实例的次数已经耗尽' };
  // A reminder keeps both actually living and registered-living holders. Callers may explicitly
  // inspect one life basis; a grey portrait alone must not erase a falsely-dead player's entrance.
  if (ability.holder.kind !== 'player') return { available: true, reason: '有可记录的能力入口；不自动判断技能生效' };
  const life = playerById(state, ability.holder.playerId).life;
  const activeLife = context.lifeBasis === 'actual' ? life.actuallyAlive : context.lifeBasis === 'treated' ? life.treatedAsAlive : life.actuallyAlive || life.treatedAsAlive;
  if (activeLife) return { available: true, reason: '有可记录的能力入口；不自动判断技能生效' };
  if (ability.deathAccess === 'retained') return { available: true, reason: '此实例登记了死后保留入口' };
  const holderId = ability.holder.playerId;
  if (ability.deathAccess === 'on-death' && !life.actuallyAlive && context.deathEvent?.effects.some(x => x.kind === 'set-life' && x.playerId === holderId && !x.actuallyAlive)) return { available: true, reason: '关联实际死亡事件的触发入口' };
  if (ability.deathAccess === 'source-trigger' && context.trigger && context.trigger.source.abilityInstanceId === abilityInstanceId && (context.trigger.state === 'pending' || context.trigger.state === 'partly-settled')) return { available: true, reason: '来源触发仍待结算' };
  return { available: false, reason: '普通死亡玩家移出主动提醒；特殊触发需关联来源' };
}
export function listAbilityEntrances(state: StateSnapshot, holder: Subject, context: AbilityContext = {}): { ability: AbilityInstance; available: boolean; reason: string }[] {
  return state.abilities.filter(x => sameSubject(x.holder, holder)).map(ability => ({ ability: structuredClone(ability), ...abilityAvailability(state, ability.abilityInstanceId, context) }));
}

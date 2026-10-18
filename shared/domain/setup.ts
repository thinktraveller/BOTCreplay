import type { Alignment, PlayerState, ReplayDocument, ScriptSnapshot } from './contracts.js';
import { projectReplay } from './projection.js';
import { SCHEMA_VERSION } from './contracts.js';
import { requireFact } from './errors.js';
import { resolveSetupAdjustments,type SetupAdjustment } from '../roles/setup-policy.js';
import { isRoleActive } from '../roles/catalog.js';
export interface SetupPlayer { nickname: string; roleId: string; alignment: Alignment; perceivedRoleId?: string; disguiseRoleId?: string }
export interface SetupInput { replayId: string; title: string; players: SetupPlayer[]; notes: string; outsiderFinalCount?:number; adjustments?:SetupAdjustment[] }
export const BASE_COUNTS: Record<number, [number, number, number, number]> = { 7:[5,0,1,1],8:[5,1,1,1],9:[5,2,1,1],10:[7,0,2,1],11:[7,1,2,1],12:[7,2,2,1],13:[9,0,3,1],14:[9,1,3,1],15:[9,2,3,1] };
export function initialDeathAccess(name:string) {if(name==='孟婆')return 'retained' as const;if(['守鸦人','贤者','秉笔','报丧女妖','月之子','心上人','理发师','瘟疫医生','帽匠','炸弹人'].includes(name))return 'on-death' as const;if(['典狱长','阎罗'].includes(name))return 'source-trigger' as const;return 'none' as const;}
export function createReplay(script: ScriptSnapshot, input: SetupInput): ReplayDocument {
  const base = BASE_COUNTS[input.players.length];
  requireFact(base, 'player-count', '人数须为7～15人');
  requireFact(input.title.trim(), 'title', '请填写复盘名称');
  const find = (id: string) => { const role = script.roles.find(item => item.role.roleId === id); requireFact(role, 'setup-role', '准备角色须存在于当前剧本', id); return role; };
  const players: PlayerState[] = input.players.map((player, i) => {
    const role = find(player.roleId);
    requireFact(['good', 'evil'].includes(player.alignment), 'alignment', '每名玩家均须选择当前实际阵营');
    return { playerId: `p${i + 1}`, seat: i + 1, nickname: player.nickname.trim() || `${i + 1}号玩家`, actualRole: structuredClone(role.role), alignment: player.alignment, ...(player.perceivedRoleId ? { perceivedRole: structuredClone(find(player.perceivedRoleId).role) } : {}), ...(player.disguiseRoleId ? { disguise: structuredClone(find(player.disguiseRoleId).role) } : {}), life: { actuallyAlive:true, treatedAsAlive:true, reasonConditionIds:[] }, abilityInstanceIds:[], conditionIds:[], reminders:[] };
  });
  const actual = ['townsfolk', 'outsider', 'minion', 'demon'].map(team => players.filter(player => player.actualRole.type === team).length);
  const policy=resolveSetupAdjustments(players.map(player=>player.actualRole.roleId).filter(isRoleActive),input.adjustments??[]);
  if(policy.requiresExplicitFinalCount){requireFact(Number.isSafeInteger(input.outsiderFinalCount)&&input.outsiderFinalCount===actual[1],'outsider-final','存在外来者设置覆盖：请填写与实际分配一致的最终外来者数量');requireFact(input.notes.trim(),'setup-reason','请说明设置覆盖的实际最终数量与裁决；多个来源不自动决定优先级');}
  if (actual.some((count, i) => count !== base[i]) || new Set(players.map(player => player.actualRole.roleId)).size < players.length) requireFact(input.notes.trim(), 'setup-adjustment', '实际配版与基础推荐不同或角色重复，请记录设置/裁决说明');
  const document: ReplayDocument = { replayId:input.replayId, schemaVersion:SCHEMA_VERSION, revision:0, title:input.title.trim(), script:structuredClone(script), rules:script.roles.map(role => structuredClone(role.currentRule)), initialState:{ players, abilities:[], conditions:[], pendingTriggers:[] }, phases:[{ phaseId:'preparation', kind:'preparation', number:0, order:0 }], assets:[], events:[] };
  for (const player of players) {
    const add = (roleId:string, mode:'real'|'perceived') => {
      const entry = find(roleId), abilityInstanceId = `${player.playerId}-${mode}`;
      player.abilityInstanceIds.push(abilityInstanceId);
      // Setup stores provenance and capabilities; role-specific outcomes remain explicitly recorded.
      document.initialState.abilities.push({ abilityInstanceId, holder:{kind:'player', playerId:player.playerId}, rule:structuredClone(entry.currentRule), mode, parameters:{}, usage:{state:'unused',used:0,evidenceEventIds:[]}, startsAt:{phaseId:'preparation'}, deathAccess:initialDeathAccess(entry.role.name) });
    };
    add(player.actualRole.roleId, 'real'); if (player.perceivedRole) add(player.perceivedRole.roleId, 'perceived');
  }
  document.events.push({ eventId:'setup', phaseId:'preparation', order:0, subject:{kind:'storyteller', name:'说书人'}, mode:'manual', action:{name:'准备完成', input:{人数:players.length,配版说明:input.notes,设置关系:JSON.parse(JSON.stringify({...policy,actualOutsiderCount:actual[1],...(input.outsiderFinalCount!==undefined?{confirmedOutsiderCount:input.outsiderFinalCount}:{})}))}}, receivedInformation:null, effects:[], relatedEffectIds:[], causes:[], visibility:'storyteller', recipients:[], note:players.map(player => `${player.seat}号 ${player.nickname}：${player.actualRole.name}（${player.alignment === 'good'?'善良':'邪恶'}）${player.perceivedRole?`，认知角色${player.perceivedRole.name}`:''}${player.disguise?`，伪装角色${player.disguise.name}`:''}`).join('\n') });
  projectReplay(document); return document;
}

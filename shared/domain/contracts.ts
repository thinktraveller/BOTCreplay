// Recorded facts shared by the editor and viewer; role actions require separate user review.
export const SCHEMA_VERSION = '0.1.0' as const;
export type Id = string;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Alignment = 'good' | 'evil';
export type RoleType = 'townsfolk' | 'outsider' | 'minion' | 'demon';
export type ActionMode = 'real-ability' | 'perceived-action' | 'disguise' | 'manual';
export type Subject =
  | { kind: 'player'; playerId: Id }
  | { kind: 'storyteller'; name: string }
  | { kind: 'group'; name: string; playerIds: Id[] };

export interface RuleReference {
  roleId: Id;
  roleName?: string;
  version: string;
  abilityText: string;
  source: string;
  // A skill-version decision alone is not approval of an action implementation.
  actionReview?: { proposalVersion: string; status: 'pending' | 'changes-requested' | 're-review' | 'approved'; decisionSource?: string };
}
export interface RoleReference { roleId: Id; name: string; type: RoleType; ruleVersion: string; iconAssetId?: Id }
export interface Phase { phaseId: Id; kind: 'preparation' | 'night' | 'day'; number: number; order: number }
export interface EventPoint { phaseId: Id; eventId?: Id }
export type Expiry =
  | { kind: 'manual'; description: string }
  | { kind: 'point'; point: EventPoint }
  | { kind: 'trigger'; triggerId: Id; description: string };
export interface CausalSource { eventId: Id; abilityInstanceId?: Id; description?: string }

export interface AbilityInstance {
  abilityInstanceId: Id;
  holder: Subject;
  rule: RuleReference;
  mode: 'real' | 'perceived';
  source?: CausalSource;
  parentAbilityInstanceId?: Id;
  parameters: { [key: string]: JsonValue };
  usage: { state: 'unused' | 'activated' | 'consumed' | 'lost'; used: number; limit?: number; evidenceEventIds: Id[] };
  startsAt: EventPoint;
  expires?: Expiry;
  deathAccess: 'none' | 'on-death' | 'retained' | 'source-trigger';
}
export interface ConditionInstance {
  conditionId: Id;
  kind: 'drunk' | 'poisoned' | 'zombuul-alive' | 'falsely-dead' | 'registration';
  targetPlayerId: Id;
  source: CausalSource;
  startsAt: EventPoint;
  expires?: Expiry;
  active: boolean;
  endedByEventId?: Id;
  registration?: { role?: RoleReference; alignment?: Alignment; alive?: boolean; appliesToAbilityInstanceId?: Id };
}
export interface Reminder { reminderId: Id; text: string; source?: CausalSource }
export interface PlayerState {
  playerId: Id;
  seat: number;
  nickname: string;
  actualRole: RoleReference;
  perceivedRole?: RoleReference;
  alignment: Alignment;
  life: { actuallyAlive: boolean; treatedAsAlive: boolean; reasonConditionIds: Id[] };
  disguise?: RoleReference;
  abilityInstanceIds: Id[];
  conditionIds: Id[];
  reminders: Reminder[];
}
export interface PendingTrigger {
  triggerId: Id;
  source: CausalSource;
  chainId: Id;
  targetPlayerIds: Id[];
  window: { description: string; earliestPhaseId?: Id; latestPhaseId?: Id };
  remaining: number;
  state: 'pending' | 'partly-settled' | 'settled' | 'cancelled';
  settlements: { eventId: Id; consumed: number; effectIds: Id[] }[];
  parameters: { [key: string]: JsonValue };
}
interface EffectBase { effectId: Id; order: number; source: CausalSource }
export type EffectOperation = EffectBase & (
  | { kind: 'set-role'; playerId: Id; role: RoleReference; perception: 'actual' | 'perceived' | 'disguise' }
  | { kind: 'clear-role'; playerId: Id; perception: 'perceived' | 'disguise' }
  | { kind: 'set-alignment'; playerId: Id; alignment: Alignment }
  | { kind: 'set-life'; playerId: Id; actuallyAlive: boolean }
  | { kind: 'execution'; playerId: Id; exceptionReason?: string }
  | { kind: 'add-condition'; condition: ConditionInstance }
  | { kind: 'end-condition'; conditionId: Id }
  | { kind: 'grant-ability'; ability: AbilityInstance }
  | { kind: 'update-ability'; abilityInstanceId: Id; usage: AbilityInstance['usage'] }
  | { kind: 'set-reminder'; playerId: Id; reminder: Reminder; active: boolean }
  | { kind: 'schedule-trigger'; trigger: PendingTrigger }
  | { kind: 'settle-trigger'; triggerId: Id; consumed: number; effectIds: Id[] }
  | { kind: 'cancel-trigger'; triggerId: Id; reason: string }
);
export interface ReplayEvent {
  eventId: Id;
  phaseId: Id;
  order: number;
  subject: Subject;
  abilityInstanceId?: Id;
  // Explicit targets also preserve information-only choices without inferring player IDs from free text.
  targetPlayerIds?: Id[];
  mode: ActionMode;
  action: { name: string; input: { [key: string]: JsonValue } };
  receivedInformation: JsonValue;
  effects: EffectOperation[];
  // Referencing an existing effect for presentation does not apply it again.
  relatedEffectIds: Id[];
  causes: CausalSource[];
  visibility: 'public' | 'private' | 'storyteller';
  recipients: Subject[];
  note: string;
  exceptionReason?: string;
}
export interface StateSnapshot {
  players: PlayerState[];
  abilities: AbilityInstance[];
  conditions: ConditionInstance[];
  pendingTriggers: PendingTrigger[];
}
export interface EventSnapshot {
  eventId: Id;
  before: StateSnapshot;
  after: StateSnapshot;
  // Subject, target and grimoire data belong to the event time, never to the latest player state.
  targetPlayerIds: Id[];
}
export interface AssetReference {
  assetId: Id;
  originalUrl?: string;
  contentHash?: string;
  mediaType: string;
  status: 'cached' | 'missing' | 'failed';
  placeholderLabel: string;
}
export interface ScriptSnapshot {
  originalJson: string;
  roles: { role: RoleReference; raw: { [key: string]: JsonValue }; currentRule: RuleReference }[];
  // Optional fields in raw retain the distinction between absent, zero, and an empty array.
  excluded: { id: Id; reason: string; raw: JsonValue }[];
}
export interface ReplayDocument {
  replayId: Id;
  schemaVersion: typeof SCHEMA_VERSION;
  revision: number;
  title: string;
  rules: RuleReference[];
  script: ScriptSnapshot;
  initialState: StateSnapshot;
  phases: Phase[];
  events: ReplayEvent[];
  assets: AssetReference[];
  finalDecision?: { eventId: Id; winningAlignment?: Alignment; explanation: string; confirmedByStoryteller: boolean };
}
export type ReplayChange =
  | { kind: 'append'; baseRevision: number; event: ReplayEvent }
  | { kind: 'revise-history'; baseRevision: number; reason: string; fromEventId: Id; events: ReplayEvent[]; orphanHandling: 'cascade' | 'relink' | 'keep-manual' };
export type SaveResult =
  | { status: 'saved'; revision: number }
  | { status: 'conflict'; expectedRevision: number; actualRevision: number }
  | { status: 'failed'; message: string; previousRevision: number };
export interface ReplayRepository {
  load(replayId: Id): Promise<ReplayDocument | undefined>;
  save(document: ReplayDocument, expectedRevision: number | null): Promise<SaveResult>;
  list(): Promise<{ replayId: Id; title: string; revision: number }[]>;
}

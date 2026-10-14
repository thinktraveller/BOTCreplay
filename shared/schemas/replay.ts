const id = { type: 'string', minLength: 1 };
const text = { type: 'string' };
const integer = { type: 'integer', minimum: 0 };
const ref = (name: string) => ({ $ref: `#/$defs/${name}` });
const array = (items: object) => ({ type: 'array', items });
const object = (properties: Record<string, object>, required: string[] = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const choice = (...values: string[]) => ({ type: 'string', enum: values });
const point = object({ phaseId: id, eventId: id }, ['phaseId']);
const source = object({ eventId: id, abilityInstanceId: id, description: text }, ['eventId']);
const role = object({ roleId: id, name: id, type: choice('townsfolk', 'outsider', 'minion', 'demon'), ruleVersion: id, iconAssetId: id }, ['roleId', 'name', 'type', 'ruleVersion']);
const origin = object({ eventId: id, timing: choice('before', 'after'), playerId: id, role, abilityInstanceId: id }, ['eventId', 'timing', 'playerId', 'role']);
const roleChange = { oneOf: [
  object({ status: { const: 'not-used' }, kind: choice('exchange', 'replacement'), wording: choice('choice', 'trigger'), selectedPlayerIds: { ...array(id), maxItems: 0 }, affectedPlayerIds: { ...array(id), maxItems: 0 }, explanation: text }, ['status', 'kind', 'selectedPlayerIds']),
  object({ status: choice('selected', 'failed'), kind: choice('exchange', 'replacement'), wording: choice('choice', 'trigger'), selectedPlayerIds: { ...array(id), minItems: 1, uniqueItems: true }, affectedPlayerIds: { ...array(id), uniqueItems: true }, explanation: text }, ['status', 'kind', 'selectedPlayerIds']),
  object({ status: { const: 'applied' }, kind: choice('exchange', 'replacement'), wording: choice('choice', 'trigger'), selectedPlayerIds: { ...array(id), minItems: 1, uniqueItems: true }, affectedPlayerIds: { ...array(id), minItems: 1, uniqueItems: true }, resultId: id, explanation: text }, ['status', 'kind', 'selectedPlayerIds', 'resultId']),
] };
const subject = { oneOf: [object({ kind: { const: 'player' }, playerId: id }), object({ kind: { const: 'storyteller' }, name: id }), object({ kind: { const: 'group' }, name: id, playerIds: { ...array(id), uniqueItems: true } })] };
const expiry = { oneOf: [object({ kind: { const: 'manual' }, description: id }), object({ kind: { const: 'point' }, point }), object({ kind: { const: 'trigger' }, triggerId: id, description: id })] };
const usage = object({ state: choice('unused', 'activated', 'consumed', 'lost'), used: integer, limit: integer, evidenceEventIds: { ...array(id), uniqueItems: true } }, ['state', 'used', 'evidenceEventIds']);
const reminder = object({ reminderId: id, text: id, source }, ['reminderId', 'text']);
const effect = (kind: string, props: Record<string, object>, required = Object.keys(props)) => object({ effectId: id, order: integer, source, kind: { const: kind }, ...props }, ['effectId', 'order', 'source', 'kind', ...required]);

export const replayDocumentSchema = {
  $id: 'botcreplay/replay-document/0.1.0',
  ...object({ replayId: id, schemaVersion: { const: '0.1.0' }, revision: integer, title: text, rules: array(ref('rule')), script: ref('script'), initialState: ref('state'), phases: { ...array(ref('phase')), minItems: 1 }, events: array(ref('event')), assets: array(ref('asset')), finalDecision: object({ eventId: id, winningAlignment: choice('good', 'evil'), explanation: id, confirmedByStoryteller: { type: 'boolean' } }, ['eventId', 'explanation', 'confirmedByStoryteller']) }, ['replayId', 'schemaVersion', 'revision', 'title', 'rules', 'script', 'initialState', 'phases', 'events', 'assets']),
  $defs: {
    json: { anyOf: [{ type: 'null' }, { type: 'boolean' }, { type: 'number' }, text, array(ref('json')), { type: 'object', additionalProperties: ref('json') }] },
    role, subject, point, source, usage,
    rule: object({ roleId: id, roleName: id, version: id, abilityText: text, source: id, actionReview: object({ proposalVersion: id, status: choice('pending', 'changes-requested', 're-review', 'approved'), decisionSource: id }, ['proposalVersion', 'status']) }, ['roleId', 'version', 'abilityText', 'source']),
    phase: object({ phaseId: id, kind: choice('preparation', 'night', 'day'), number: integer, order: integer }),
    ability: object({ abilityInstanceId: id, holder: subject, rule: ref('rule'), mode: choice('real', 'perceived'), source, parentAbilityInstanceId: id, parameters: { type: 'object', additionalProperties: ref('json') }, usage, startsAt: point, expires: expiry, deathAccess: choice('none', 'on-death', 'retained', 'source-trigger') }, ['abilityInstanceId', 'holder', 'rule', 'mode', 'parameters', 'usage', 'startsAt', 'deathAccess']),
    condition: object({ conditionId: id, kind: choice('drunk', 'poisoned', 'zombuul-alive', 'falsely-dead', 'registration'), targetPlayerId: id, source, startsAt: point, expires: expiry, active: { type: 'boolean' }, endedByEventId: id, registration: object({ role, alignment: choice('good', 'evil'), alive: { type: 'boolean' }, appliesToAbilityInstanceId: id }, []) }, ['conditionId', 'kind', 'targetPlayerId', 'source', 'startsAt', 'active']),
    player: object({ playerId: id, seat: { type: 'integer', minimum: 1 }, nickname: text, actualRole: role, perceivedRole: role, alignment: choice('good', 'evil'), life: object({ actuallyAlive: { type: 'boolean' }, treatedAsAlive: { type: 'boolean' }, reasonConditionIds: { ...array(id), uniqueItems: true } }), disguise: role, abilityInstanceIds: { ...array(id), uniqueItems: true }, conditionIds: { ...array(id), uniqueItems: true }, reminders: array(reminder) }, ['playerId', 'seat', 'nickname', 'actualRole', 'alignment', 'life', 'abilityInstanceIds', 'conditionIds', 'reminders']),
    trigger: object({ triggerId: id, source, chainId: id, targetPlayerIds: { ...array(id), uniqueItems: true }, window: object({ description: id, earliestPhaseId: id, latestPhaseId: id }, ['description']), remaining: integer, state: choice('pending', 'partly-settled', 'settled', 'cancelled'), settlements: array(object({ eventId: id, consumed: { type: 'integer', minimum: 1 }, effectIds: { ...array(id), uniqueItems: true } })), parameters: { type: 'object', additionalProperties: ref('json') } }, ['triggerId', 'source', 'chainId', 'targetPlayerIds', 'window', 'remaining', 'state', 'settlements', 'parameters']),
    state: object({ players: array(ref('player')), abilities: array(ref('ability')), conditions: array(ref('condition')), pendingTriggers: array(ref('trigger')) }),
    effect: { oneOf: [
      effect('set-role', { playerId: id, role, perception: choice('actual', 'perceived', 'disguise') }),
      effect('change-roles', { resultId: id, changeKind: choice('exchange', 'replacement'), changes: { ...array(object({ playerId: id, from: role, to: role })), minItems: 1 } }),
      effect('clear-role', { playerId: id, perception: choice('perceived', 'disguise') }),
      effect('set-alignment', { playerId: id, alignment: choice('good', 'evil') }),
      effect('set-life', { playerId: id, actuallyAlive: { type: 'boolean' } }),
      effect('execution', { playerId: id, exceptionReason: id }, ['playerId']),
      effect('add-condition', { condition: ref('condition') }),
      effect('end-condition', { conditionId: id }),
      effect('grant-ability', { ability: ref('ability') }),
      effect('update-ability', { abilityInstanceId: id, usage }),
      effect('set-reminder', { playerId: id, reminder, active: { type: 'boolean' } }),
      effect('schedule-trigger', { trigger: ref('trigger') }),
      effect('settle-trigger', { triggerId: id, consumed: { type: 'integer', minimum: 1 }, effectIds: { ...array(id), uniqueItems: true } }),
      effect('cancel-trigger', { triggerId: id, reason: id }),
    ] },
    event: object({ eventId: id, phaseId: id, order: integer, subject, abilityInstanceId: id, abilityOrigin: origin, roleChange, roleChangeResultId: id, targetPlayerIds: { ...array(id), uniqueItems: true }, mode: choice('real-ability', 'perceived-action', 'disguise', 'manual'), action: object({ name: id, input: { type: 'object', additionalProperties: ref('json') } }), receivedInformation: ref('json'), effects: array(ref('effect')), relatedEffectIds: { ...array(id), uniqueItems: true }, causes: array(source), visibility: choice('public', 'private', 'storyteller'), recipients: array(subject), note: text, exceptionReason: id }, ['eventId', 'phaseId', 'order', 'subject', 'mode', 'action', 'receivedInformation', 'effects', 'relatedEffectIds', 'causes', 'visibility', 'recipients', 'note']),
    asset: object({ assetId: id, originalUrl: text, contentHash: text, mediaType: id, status: choice('cached', 'missing', 'failed'), placeholderLabel: text }, ['assetId', 'mediaType', 'status', 'placeholderLabel']),
    script: object({ originalJson: text, roles: array(object({ role, raw: { type: 'object', additionalProperties: ref('json') }, currentRule: ref('rule') })), excluded: array(object({ id, reason: id, raw: ref('json') })) }),
  },
};

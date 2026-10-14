const id = { type: 'string', minLength: 1 };
const strings = { type: 'array', items: id };
const rawRole = {
  type: 'object', required: ['id', 'name', 'team', 'ability'],
  properties: { id, name: id, team: { enum: ['townsfolk', 'outsider', 'minion', 'demon'] }, ability: { type: 'string' }, image: { anyOf: [id, strings] }, reminders: strings, remindersGlobal: strings, firstNight: { type: 'number', minimum: 0 }, otherNight: { type: 'number', minimum: 0 }, setup: { type: 'boolean' } },
  additionalProperties: true,
};
export const roleSourceSchema = {
  $id: 'botcreplay/default-role-source/v1', type: 'object', additionalProperties: false, required: ['manifest', 'roles', 'excluded'],
  properties: {
    manifest: { type: 'object', required: ['sourceSha256', 'goalSha256', 'sourceVersion', 'originalItemCount', 'supportedCount', 'excludedCount'], properties: { sourceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, goalSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, sourceVersion: { const: 'source-v1' }, originalItemCount: { const: 221 }, supportedCount: { const: 197 }, excludedCount: { const: 23 } }, additionalProperties: true },
    roles: { type: 'array', minItems: 197, maxItems: 197, items: rawRole },
    excluded: { type: 'array', minItems: 23, maxItems: 23, items: { type: 'object', additionalProperties: false, required: ['roleId', 'reason', 'raw'], properties: { roleId: id, reason: id, raw: { type: 'object', additionalProperties: true } } } },
  },
};
export const actionProposalsSchema = {
  $id: 'botcreplay/action-proposals/v1', type: 'array', minItems: 197, maxItems: 197,
  items: {
    type: 'object', additionalProperties: false,
    required: ['roleId', 'entryId', 'name', 'type', 'ruleVersion', 'proposalVersion', 'trigger', 'input', 'result', 'exceptions', 'normalExample', 'boundaryExample', 'reviewDocument', 'review'],
    properties: {
      roleId: id, entryId: { type: 'string', pattern: '^S001-R-[TOMD][0-9]{3}$' }, name: id, type: { enum: ['townsfolk', 'outsider', 'minion', 'demon'] }, ruleVersion: id, proposalVersion: id, trigger: id, input: id, result: id, exceptions: id, normalExample: id, boundaryExample: id, reviewDocument: id,
      revisionHistory: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['fromVersion', 'toVersion', 'source', 'summary', 'changedAt'], properties: { fromVersion: id, toVersion: id, source: id, summary: id, changedAt: id } } },
      review: {
        type: 'object', additionalProperties: false, required: ['status', 'feedback', 'implementation', 'validation'],
        properties: {
          status: { enum: ['pending', 'changes-requested', 're-review', 'approved'] }, implementation: { enum: ['not-implemented', 'implemented'] }, validation: { enum: ['not-run', 'passed', 'failed'] },
          feedback: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['roleId', 'ruleVersion', 'proposalVersion', 'kind', 'scope', 'originalText', 'source', 'recordedAt'], properties: { roleId: id, ruleVersion: id, proposalVersion: id, kind: { enum: ['approve', 'changes-requested', 'comment'] }, scope: { const: 'complete-action' }, originalText: id, source: id, recordedAt: id } } },
        },
      },
    },
  },
};

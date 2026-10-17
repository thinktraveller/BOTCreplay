import { Ajv } from 'ajv';
import type { ReplayDocument } from '../domain/contracts.js';
import { replayDocumentSchema } from './replay.js';
import { actionProposalsSchema, roleSourceSchema } from './roles.js';
import { recordingFormatsSchema } from './recording.js';
import { roleScopeSchema } from './role-scope.js';

const ajv = new Ajv({ allErrors: true, strict: true, strictNumbers: true });
const validate = ajv.compile<ReplayDocument>(replayDocumentSchema);
const validateSources = ajv.compile(roleSourceSchema);
const validateProposals = ajv.compile(actionProposalsSchema);
const validateRecording = ajv.compile(recordingFormatsSchema);
const validateScope = ajv.compile(roleScopeSchema);
export function validateRoleScope(input: unknown): { valid: boolean; errors: { path: string; message: string }[] } {
  const valid=!!validateScope(input);return {valid,errors:valid?[]:(validateScope.errors??[]).map(error=>({path:error.instancePath||'/',message:error.message??error.keyword}))};
}
export function validateRecordingFormats(input: unknown): { valid: boolean; errors: { path: string; message: string }[] } {
  const valid=!!validateRecording(input);return {valid,errors:valid?[]:(validateRecording.errors??[]).map(error=>({path:error.instancePath||'/',message:error.message??error.keyword}))};
}
export function validateReplayStructure(input: unknown): { valid: true; document: ReplayDocument } | { valid: false; errors: { path: string; message: string }[] } {
  if (validate(input)) return { valid: true, document: input };
  return { valid: false, errors: (validate.errors ?? []).map(error => ({ path: error.instancePath || '/', message: error.message ?? error.keyword })) };
}
export function validateDefaultRoleData(sources: unknown, proposals: unknown): { valid: boolean; errors: { path: string; message: string }[] } {
  const errors: { path: string; message: string }[] = [];
  if (!validateSources(sources)) errors.push(...(validateSources.errors ?? []).map(error => ({ path: `sources${error.instancePath}`, message: error.message ?? error.keyword })));
  if (!validateProposals(proposals)) errors.push(...(validateProposals.errors ?? []).map(error => ({ path: `proposals${error.instancePath}`, message: error.message ?? error.keyword })));
  return { valid: !errors.length, errors };
}

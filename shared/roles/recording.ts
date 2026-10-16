import catalogue from './recording-formats.json' with { type: 'json' };
import type { CustomRecord } from '../domain/contracts.js';

export interface RecordingField { label: string; control: string; detail: string; customOption: '自定义'; customPart: CustomRecord['part'] }
export interface RecordingForm {
  branchId: string; label: string; timing: string; fields: RecordingField[]; path: string;
  sentences: string[]; exampleInput: string; exampleOutput: string[]; notes: string;
  custom: { choice: '自定义'; parts: CustomRecord['part'][]; textRequired: true; retainContext: true; effects: 'explicit-only'; path: string; exampleText: string };
}
export interface RecordingProfile { roleId: string; entryId: string; proposalVersion: string; customOption: '自定义'; forms: RecordingForm[] }
const profiles = new Map((catalogue.roles as RecordingProfile[]).map(profile=>[profile.roleId,profile]));
export function getRecordingProfile(exactRoleId: string): RecordingProfile | undefined {
  const profile=profiles.get(exactRoleId);return profile?structuredClone(profile):undefined;
}
export function getCommonRecordingForms(): RecordingForm[] { return structuredClone(catalogue.commonForms as RecordingForm[]); }
export function getRecordingCoverage() {
  const roleForms=[...profiles.values()].flatMap(profile=>profile.forms);
  return { roles:profiles.size,roleBranches:roleForms.length,commonBranches:catalogue.commonForms.length,customizableFields:[...roleForms,...catalogue.commonForms].reduce((sum,form)=>sum+form.fields.length,0) };
}

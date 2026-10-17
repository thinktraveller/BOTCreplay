import catalogue from './recording-formats.json' with { type: 'json' };
import type { CustomRecord } from '../domain/contracts.js';
import scope from './role-scope.json' with { type: 'json' };
import reviewRequirements from './review-requirements.json' with { type: 'json' };
import { getSourceRole, isRoleActive } from './catalog.js';
import type { RecordedActionDraft } from '../domain/drafts.js';

export interface RecordingField { label: string; control: string; detail: string; customOption: '自定义'; customPart: CustomRecord['part'] }
export interface RecordingForm {
  branchId: string; label: string; timing: string; fields: RecordingField[]; path: string;
  sentences: string[]; exampleInput: string; exampleOutput: string[]; notes: string;
  custom: { choice: '自定义'; parts: CustomRecord['part'][]; textRequired: true; retainContext: true; effects: 'explicit-only'; path: string; exampleText: string };
}
export interface RecordingProfile { roleId: string; entryId: string; proposalVersion: string; customOption: '自定义'; forms: RecordingForm[] }
const profiles = new Map((catalogue.roles as RecordingProfile[]).map(profile=>[profile.roleId,profile]));
export function getRecordingProfile(exactRoleId: string): RecordingProfile | undefined {
  return isRoleActive(exactRoleId) ? getArchivedRecordingProfile(exactRoleId) : undefined;
}
export function getArchivedRecordingProfile(exactRoleId: string): RecordingProfile | undefined {
  const profile=profiles.get(exactRoleId);return profile?structuredClone(profile):undefined;
}
export function getCommonRecordingForms(): RecordingForm[] { return structuredClone(catalogue.commonForms as RecordingForm[]); }
export function getRoleReviewRequirements(exactRoleId:string) {
  const profile=getRecordingProfile(exactRoleId);
  if (!profile) return undefined;
  const id=profile.entryId.slice(-4);
  const detail=[...reviewRequirements.detail.explicit,...reviewRequirements.detail.proposed].find(item=>item.id===id);
  const noEffect=[...reviewRequirements.noEffect.explicit,...reviewRequirements.noEffect.proposed].find(item=>item.id===id);
  return structuredClone({detail,noEffect});
}
export function getRecordingCoverage() {
  const activeProfiles=[...profiles.values()].filter(profile=>isRoleActive(profile.roleId));
  const roleForms=activeProfiles.flatMap(profile=>profile.forms);
  return { roles:activeProfiles.length,archivedRoles:profiles.size,roleBranches:roleForms.length,commonBranches:catalogue.commonForms.length,customizableFields:[...roleForms,...catalogue.commonForms].reduce((sum,form)=>sum+form.fields.length,0) };
}

export interface CognitiveRecordingProfile {
  actualRoleId: string;
  perceivedRoleId: string;
  templateRoleId: string;
  mode: 'perceived-action';
  automaticEffects: false;
  identityFormat: string;
  profile: RecordingProfile;
}
export function getCognitiveRecordingProfile(actualRoleId:string,perceivedRoleId:string,perceivedAbilityRoleId?:string): CognitiveRecordingProfile | undefined {
  if (!(scope.cognitiveRoleIds as string[]).includes(actualRoleId)) return undefined;
  const actual=getSourceRole(actualRoleId),perceived=getSourceRole(perceivedRoleId);
  if (!actual || !perceived) return undefined;
  const actualEntry=profiles.get(actualRoleId)!.entryId;
  const allowed=actualEntry.endsWith('O002') ? perceived.team==='townsfolk' : actualEntry.endsWith('O008') ? perceived.team==='demon' : actualEntry.endsWith('T082') ? perceived.team==='outsider' : perceived.team==='townsfolk'||perceived.team==='outsider';
  if (!allowed) return undefined;
  const templateRoleId=perceivedAbilityRoleId??perceivedRoleId;
  const profile=getRecordingProfile(templateRoleId);
  if (!profile) return undefined;
  return {actualRoleId,perceivedRoleId,templateRoleId,mode:'perceived-action',automaticEffects:false,identityFormat:`【实际玩家】（${actual.name}[${perceived.name}]${perceivedAbilityRoleId?'，认知获得'+getSourceRole(templateRoleId)!.name+'能力':''}）`,profile};
}
// Only surface action and received information are taken from the template.
// Real effects require a separate real source and never travel through this adapter.
export function createCognitiveRecordingDraft(profile:CognitiveRecordingProfile,input:Pick<RecordedActionDraft,'subject'|'targetPlayerIds'|'action'|'receivedInformation'|'customRecords'>):RecordedActionDraft {
  const verified=getCognitiveRecordingProfile(profile.actualRoleId,profile.perceivedRoleId,profile.templateRoleId===profile.perceivedRoleId?undefined:profile.templateRoleId);
  if (!verified) throw new Error('认知角色或对应能力模板不在当前允许范围');
  return {subject:structuredClone(input.subject),targetPlayerIds:[...input.targetPlayerIds],action:structuredClone(input.action),receivedInformation:structuredClone(input.receivedInformation),...(input.customRecords?{customRecords:structuredClone(input.customRecords)}:{}),mode:'perceived-action',effects:[]};
}

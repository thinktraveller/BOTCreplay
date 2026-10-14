import type { JsonValue, RoleType } from '../domain/contracts.js';

export interface SourceRole {
  id: string;
  name: string;
  team: RoleType;
  ability: string;
  image?: string | string[];
  reminders?: string[];
  remindersGlobal?: string[];
  firstNight?: number;
  otherNight?: number;
  [key: string]: JsonValue | undefined;
}
export interface RuleOverride {
  roleId: string;
  entryId: string;
  version: string;
  abilityText: string;
  decisionSource: string;
  retiredGuidance: string;
  recordingSummary: string;
  normalizedSummary: boolean;
}
export interface RoleFeedback {
  roleId: string;
  ruleVersion: string;
  proposalVersion: string;
  kind: 'approve' | 'changes-requested' | 'comment';
  scope: 'complete-action';
  originalText: string;
  source: string;
  recordedAt: string;
}
export interface ActionProposal {
  roleId: string;
  entryId: string;
  name: string;
  type: RoleType;
  ruleVersion: string;
  proposalVersion: string;
  trigger: string;
  input: string;
  result: string;
  exceptions: string;
  normalExample: string;
  boundaryExample: string;
  reviewDocument: string;
  review: {
    status: 'pending' | 'changes-requested' | 're-review' | 'approved';
    feedback: RoleFeedback[];
    implementation: 'not-implemented' | 'implemented';
    validation: 'not-run' | 'passed' | 'failed';
  };
}

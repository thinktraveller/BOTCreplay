import type { ActionProposal, RoleFeedback } from './types.js';

export function recordRoleFeedback(proposal: ActionProposal, feedback: RoleFeedback): ActionProposal {
  if (feedback.roleId !== proposal.roleId || feedback.ruleVersion !== proposal.ruleVersion || feedback.proposalVersion !== proposal.proposalVersion) throw new Error('用户反馈的角色或版本与当前动作方案不一致');
  if (feedback.scope !== 'complete-action' || !feedback.originalText.trim() || !feedback.source.trim() || !Number.isFinite(Date.parse(feedback.recordedAt))) throw new Error('需要完整动作审查的用户原反馈、来源和记录时间');
  const result = structuredClone(proposal);
  result.review.feedback.push(structuredClone(feedback));
  if (feedback.kind === 'approve') result.review.status = 'approved';
  if (feedback.kind === 'changes-requested') { result.review.status = 'changes-requested'; result.review.implementation = 'not-implemented'; result.review.validation = 'not-run'; }
  return result;
}
export function requireApprovedProposal(proposal: ActionProposal): void {
  const lastDecision = proposal.review.feedback.filter(item => item.kind !== 'comment').at(-1);
  if (proposal.review.status !== 'approved' || !lastDecision || lastDecision.kind !== 'approve' || lastDecision.roleId !== proposal.roleId || lastDecision.ruleVersion !== proposal.ruleVersion || lastDecision.proposalVersion !== proposal.proposalVersion || lastDecision.scope !== 'complete-action' || !lastDecision.originalText.trim() || !lastDecision.source.trim() || !Number.isFinite(Date.parse(lastDecision.recordedAt))) throw new Error(`角色 ${proposal.entryId} 的当前完整动作方案尚未取得用户明确通过`);
}
export function reviseActionProposal(proposal: ActionProposal, fields: Pick<ActionProposal, 'trigger' | 'input' | 'result' | 'exceptions' | 'proposalVersion'>): ActionProposal {
  if (fields.proposalVersion === proposal.proposalVersion) throw new Error('动作方案修改必须更新版本，以保留既有用户反馈依据');
  return { ...structuredClone(proposal), trigger: fields.trigger, input: fields.input, result: fields.result, exceptions: fields.exceptions, proposalVersion: fields.proposalVersion, review: { ...structuredClone(proposal.review), status: 're-review', implementation: 'not-implemented', validation: 'not-run' } };
}

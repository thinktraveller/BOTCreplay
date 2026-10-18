import { supportedRoleIds, getSourceRole, getActionProposal, getCurrentRule } from './catalog.js';
import { getRecordingProfile, type RecordingForm } from './recording.js';
import type { EditorBranch, EditorField, EditorRole, FieldKind, RoleLibrary } from './editor-model.js';
import { sentenceGroups, sentenceLabel } from './editor-sentence-groups.js';
function fieldKind(control: string, label: string): FieldKind {
    if (/数字|整数|非负/.test(control))
        return 'number';
    if (/玩家|目标|主语/.test(label) && !/名单|数量|是否|来源|内容/.test(label))
        return 'players';
    if (/自由文本|说明|原文|原因|内容/.test(control + label))
        return 'textarea';
    if (control.includes('／') && control.length < 70)
        return 'select';
    if (/角色/.test(label) && !/是否|名称|信息/.test(label))
        return 'role';
    return 'text';
}
function convertForm(form: RecordingForm, roleName: string): EditorBranch {
    const tokens = [...new Set([...form.sentences.join('\n').matchAll(/【([^】]+)】/g)].map(m => m[1]))];
    const players = [...new Set(form.exampleOutput.join('\n').match(/\d+号玩家（[^）]+）(?:💀)?/g) ?? [])];
    let playerIndex = 1;
    const fields: EditorField[] = tokens.map((token, i) => {
        const spec = form.fields.find(f => f.label === token) ?? form.fields.find(f => f.label.includes(token) || token.includes(f.label));
        const kind = fieldKind(spec?.control ?? '', token);
        const options = kind === 'select' ? (spec?.control ?? '').split('／').map(s => s.trim()).filter(Boolean) : [];
        const optional = /详细说明|详细记录|具体记录依据/.test(token) || /可选/.test((spec?.control ?? '') + (spec?.detail ?? ''));
        const example = optional ? '' : /主语|行动者|本人/.test(token) ? players[0] ?? `1号玩家（${roleName}）` : kind === 'players' ? players[playerIndex++] ?? `${playerIndex}号玩家` : kind === 'number' ? '1' : options[0] ?? '';
        return { id: `${form.branchId}-field-${i + 1}`, key: `field_${i + 1}`, label: token, kind, required: !optional, options, example, help: spec?.detail ?? '按本局实际情况填写；也可选择自定义。' };
    });
    const keys = new Map(tokens.map((token, i) => [token, `field_${i + 1}`]));
    const notes = [form.notes, form.detailRequirement ? '可选详细说明：' + form.detailRequirement.condition : '', form.noEffectRequirement ? '无事发生条件：' + form.noEffectRequirement.condition : ''].filter(Boolean).join('\n');
    const groups = sentenceGroups(form), convert = (lines: string[]) => lines.join('\n').replace(/^（可选(详细说明|详细记录)）/gm,'$1：').replace(/【([^】]+)】/g, (_, key: string) => '{{' + keys.get(key) + '}}');
    return { id: form.branchId, name: form.label, timing: form.timing, fields, template: convert(groups[0]), ...(groups.length > 1 ? { templateLabel: sentenceLabel(groups[0], 0, form.branchId), variants: groups.slice(1).map((lines, i) => ({ id: form.branchId + '-result-' + (i + 2), label: sentenceLabel(lines, i + 1, form.branchId), template: convert(lines) })) } : {}), notes, source: { branchId: form.branchId, fields: form.fields.map(f => ({ label: f.label, control: f.control, detail: f.detail })), sample: form.exampleOutput.join('\n'), input: form.exampleInput } };
}
export function createDefaultLibrary(): RoleLibrary {
    const roles: EditorRole[] = supportedRoleIds.map(id => {
        const source = getSourceRole(id)!, proposal = getActionProposal(id)!, profile = getRecordingProfile(id)!;
        return { id, name: source.name, team: source.team, ability: getCurrentRule(id)!.abilityText, notes: '', enabled: true, origin: 'builtin', revision: 1, savedAt: '', history: [], base: { entryId: proposal.entryId, proposalVersion: proposal.proposalVersion, reviewStatus: proposal.review.status }, branches: profile.forms.map(f => convertForm(f, source.name)) };
    });
    return { schemaVersion: 'role-library-v1', revision: 0, updatedAt: '', roles };
}

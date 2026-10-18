import type { RoleType } from '../domain/contracts.js';
export type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'players' | 'role';
export interface EditorField {
    id: string;
    key: string;
    label: string;
    kind: FieldKind;
    required: boolean;
    options: string[];
    example: string;
    help: string;
}
export interface EditorBranch {
    id: string;
    name: string;
    timing: string;
    fields: EditorField[];
    template: string;
    templateLabel?: string;
    variants?: {
        id: string;
        label: string;
        template: string;
    }[];
    notes: string;
    source?: {
        branchId: string;
        fields: {
            label: string;
            control: string;
            detail: string;
        }[];
        sample: string;
        input: string;
    };
}
export interface RoleBody {
    name: string;
    team: RoleType;
    ability: string;
    notes: string;
    branches: EditorBranch[];
}
export interface RoleVersion {
    revision: number;
    savedAt: string;
    label: string;
    enabled: boolean;
    body: RoleBody;
}
export interface EditorRole extends RoleBody {
    id: string;
    enabled: boolean;
    origin: 'builtin' | 'custom';
    revision: number;
    savedAt: string;
    base?: {
        entryId: string;
        proposalVersion: string;
        reviewStatus: string;
    };
    history: RoleVersion[];
}
export interface RoleLibrary {
    schemaVersion: 'role-library-v1';
    revision: number;
    updatedAt: string;
    roles: EditorRole[];
}
export interface EditorIssue {
    path: string;
    message: string;
}
export const TEAM_LABELS: Record<RoleType, string> = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' };
export const FIELD_LABELS: Record<FieldKind, string> = { text: '短文本', textarea: '多行文本', number: '数字', select: '选项', players: '玩家', role: '角色' };
export const MAX_LIBRARY_BYTES = 16 * 1024 * 1024;
const id = () => crypto.randomUUID();
// The library is JSON data. JSON copying also accepts Vue reactive objects at the UI boundary.
export function copyJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function newField(index = 1): EditorField { return { id: id(), key: `field_${index}`, label: '新字段', kind: 'text', required: true, options: [], example: '', help: '' }; }
export function newBranch(): EditorBranch {
    return { id: id(), name: '新的记录分支', timing: '选择适用时点', fields: [{ ...newField(), label: '主语', key: 'actor', kind: 'players', example: '1号玩家' }, { ...newField(2), label: '本次内容', key: 'content', example: '记录了实际情况' }], template: '{{actor}}{{content}}。', notes: '' };
}
export function newRole(now = new Date().toISOString()): EditorRole {
    return { id: 'custom-' + id(), name: '未命名角色', team: 'townsfolk', ability: '', notes: '', enabled: true, origin: 'custom', revision: 0, savedAt: now, history: [], branches: [newBranch()] };
}
export function roleBody(role: EditorRole): RoleBody { return copyJson({ name: role.name, team: role.team, ability: role.ability, notes: role.notes, branches: role.branches }); }
export function templateKeys(template: string): string[] { return [...new Set([...template.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)].map(m => m[1]))]; }
export function selectedTemplate(branch: EditorBranch, variantId = ''): string { return branch.variants?.find(v => v.id === variantId)?.template ?? branch.template; }
export function renderBranch(branch: EditorBranch, values: Record<string, string>, customText?: string, customFieldKeys: string[] = [], variantId = ''): {
    text: string;
    missing: string[];
} {
    if (customText !== undefined)
        return { text: customText, missing: customText.trim() ? [] : ['自定义正文'] };
    const template = selectedTemplate(branch, variantId), used = new Set(templateKeys(template));
    const activeFields = branch.fields.filter(f => used.has(f.key));
    const missing = activeFields.filter(f => f.required && !(values[f.key] ?? '').trim()).map(f => f.label);
    for (const field of activeFields) {
        const value = values[field.key] ?? '';
        if (field.kind === 'number' && !customFieldKeys.includes(field.key) && value.trim() && !Number.isFinite(Number(value)))
            missing.push(field.label + '需填写数字');
        if (field.kind === 'select' && value && !field.options.includes(value) && !customFieldKeys.includes(field.key))
            missing.push(field.label + '不在选项中');
    }
    const lines = template.split('\n').filter(line => { const keys = templateKeys(line); return !keys.length || !keys.every(key => branch.fields.some(f => f.key === key && !f.required) && !(values[key] ?? '').trim()); });
    return { text: lines.join('\n').replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_, key: string) => values[key] ?? `〔待填：${branch.fields.find(f => f.key === key)?.label ?? key}〕`), missing };
}
export function validateRole(role: unknown, path = '角色'): EditorIssue[] {
    const errors: EditorIssue[] = [];
    const fail = (part: string, message: string) => errors.push({ path: path + part, message });
    if (!role || typeof role !== 'object' || Array.isArray(role))
        return [{ path, message: '需要完整的角色配置' }];
    const r = role as EditorRole;
    for (const key of Object.keys(r))
        if (!['id', 'name', 'team', 'ability', 'notes', 'branches', 'enabled', 'origin', 'revision', 'savedAt', 'base', 'history'].includes(key))
            fail('.' + key, '不支持的角色配置字段');
    const text = (value: unknown, part: string, required = false, max = 20000) => {
        if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
            fail(part, required ? '请填写有效内容' : '内容格式或长度不正确');
    };
    text(r.id, '.id', true, 240);
    text(r.name, '.名称', true, 120);
    text(r.ability, '.技能');
    text(r.notes, '.说明');
    text(r.savedAt, '.保存时间');
    if (!Object.hasOwn(TEAM_LABELS, r.team))
        fail('.类型', '请选择角色类型');
    if (typeof r.enabled !== 'boolean' || !['builtin', 'custom'].includes(r.origin) || !Number.isSafeInteger(r.revision) || r.revision < 0)
        fail('', '角色状态或版本无效');
    if (!Array.isArray(r.branches) || r.branches.length > 120)
        return [...errors, { path: path + '.分支', message: '分支列表无效（最多120个）' }];
    const seenBranches = new Set<string>();
    r.branches.forEach((b, i) => {
        const p = `.分支${i + 1}`;
        if (!b || typeof b !== 'object') {
            fail(p, '分支无效');
            return;
        }
        for (const key of Object.keys(b))
            if (!['id', 'name', 'timing', 'fields', 'template', 'templateLabel', 'variants', 'notes', 'source'].includes(key))
                fail(p + '.' + key, '不支持的分支字段');
        text(b.id, p + '.id', true, 240);
        if (seenBranches.has(b.id))
            fail(p, '分支ID重复');
        seenBranches.add(b.id);
        text(b.name, p + '.名称', true, 200);
        text(b.timing, p + '.时点', true, 2000);
        text(b.template, p + '.句式', true);
        text(b.notes, p + '.说明');
        if (!Array.isArray(b.fields) || b.fields.length > 160) {
            fail(p, '字段列表无效（最多160个）');
            return;
        }
        const keys = new Set<string>(), fieldIds = new Set<string>();
        b.fields.forEach((f, j) => {
            const q = p + `.字段${j + 1}`;
            if (!f || typeof f !== 'object') {
                fail(q, '字段无效');
                return;
            }
            for (const key of Object.keys(f))
                if (!['id', 'key', 'label', 'kind', 'required', 'options', 'example', 'help'].includes(key))
                    fail(q + '.' + key, '不支持的控件字段');
            text(f.id, q + '.id', true, 240);
            text(f.key, q + '.变量', true, 80);
            text(f.label, q + '.名称', true, 200);
            text(f.example, q + '.示例');
            text(f.help, q + '.说明');
            if (typeof f.key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(f.key) || ['constructor', 'prototype', '__proto__'].includes(f.key))
                fail(q, '变量只能用小写字母、数字及下划线，并以字母开头');
            if (keys.has(f.key) || fieldIds.has(f.id))
                fail(q, '字段变量或ID重复');
            keys.add(f.key);
            fieldIds.add(f.id);
            if (!Object.hasOwn(FIELD_LABELS, f.kind) || typeof f.required !== 'boolean')
                fail(q, '字段控件或必填设置无效');
            if (!Array.isArray(f.options) || f.options.length > 100 || f.options.some(v => typeof v !== 'string' || !v.trim() || v.length > 2000) || new Set(f.options).size !== f.options.length)
                fail(q, '选项须为不重复的非空文字（最多100项）');
            else if (f.kind === 'select' && !f.options.length)
                fail(q, '选项控件至少需要一个预设选项');
        });
        if (b.templateLabel !== undefined)
            text(b.templateLabel, p + '.默认句式名称', true, 200);
        const templates = [{ label: '默认句式', template: b.template }];
        if (b.variants !== undefined) {
            if (!Array.isArray(b.variants) || b.variants.length > 50)
                fail(p + '.结果句式', '最多50个结果句式');
            else {
                const variantIds = new Set<string>();
                for (const v of b.variants) {
                    if (!v || typeof v !== 'object') {
                        fail(p + '.结果句式', '句式无效');
                        continue;
                    }
                    text(v.id, p + '.结果句式ID', true, 240);
                    text(v.label, p + '.结果句式名称', true, 200);
                    text(v.template, p + '.结果句式', true);
                    if (variantIds.has(v.id))
                        fail(p + '.结果句式', '结果句式ID重复');
                    variantIds.add(v.id);
                    templates.push(v);
                }
            }
        }
        for (const entry of templates)
            if (typeof entry.template === 'string') {
                for (const key of templateKeys(entry.template))
                    if (!keys.has(key))
                        fail(p + '.句式', `变量 {{${key}}} 没有对应字段`);
                if (/\{\{|\}\}/.test(entry.template.replace(/\{\{[a-z][a-z0-9_]*\}\}/g, '')))
                    fail(p + '.句式', '变量格式应为 {{field_key}}');
            }
        if (b.source) {
            text(b.source.branchId, p + '.原分支ID', true, 240);
            text(b.source.sample, p + '.原示例');
            text(b.source.input, p + '.原填写');
            if (!Array.isArray(b.source.fields))
                fail(p + '.原字段', '原字段说明无效');
            else
                b.source.fields.forEach((f, j) => {
                    if (!f || typeof f !== 'object') {
                        fail(p + '.原字段', '说明无效');
                        return;
                    }
                    for (const k of ['label', 'control', 'detail'] as const)
                        text(f[k], p + `.原字段${j + 1}.${k}`);
                });
        }
    });
    if (!Array.isArray(r.history) || r.history.length > 30)
        fail('.历史', '历史版本最多保留30项');
    else
        for (const v of r.history) {
            if (!v || typeof v !== 'object' || !Number.isSafeInteger(v.revision) || typeof v.savedAt !== 'string' || typeof v.label !== 'string' || typeof v.enabled !== 'boolean' || !v.body || typeof v.body !== 'object') {
                fail('.历史', '历史版本格式无效');
                continue;
            }
            const nested = { ...v.body, id: r.id, origin: r.origin, enabled: v.enabled, revision: v.revision, savedAt: v.savedAt, history: [] };
            errors.push(...validateRole(nested, path + '.历史版本' + v.revision));
        }
    if (r.base && (typeof r.base.entryId !== 'string' || typeof r.base.proposalVersion !== 'string' || typeof r.base.reviewStatus !== 'string'))
        fail('.来源', '内置来源无效');
    return errors;
}
export function validateLibrary(value: unknown): EditorIssue[] {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return [{ path: '角色库', message: '需要角色库JSON对象' }];
    const data = value as RoleLibrary;
    if (data.schemaVersion !== 'role-library-v1' || !Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.updatedAt !== 'string' || !Array.isArray(data.roles) || data.roles.length > 1000)
        return [{ path: '角色库', message: '角色库版本/结构无效，最多1000个角色' }];
    const errors: EditorIssue[] = [], seen = new Set<string>();
    data.roles.forEach((role, i) => {
        errors.push(...validateRole(role, `角色${i + 1}`));
        if (role && typeof role === 'object') {
            if (seen.has(role.id))
                errors.push({ path: `角色${i + 1}`, message: '角色ID重复' });
            seen.add(role.id);
        }
    });
    return errors;
}
export function saveRole(library: RoleLibrary, draft: EditorRole, now = new Date().toISOString(), label = '编辑角色'): RoleLibrary {
    const issues = validateRole(draft);
    if (issues.length)
        throw new Error(issues.map(e => e.path + '：' + e.message).join('\n'));
    const result = copyJson(library), index = result.roles.findIndex(r => r.id === draft.id), previous = result.roles[index];
    const role = copyJson(draft);
    role.history = previous ? [{ revision: previous.revision, savedAt: previous.savedAt, label, enabled: previous.enabled, body: roleBody(previous) }, ...previous.history].slice(0, 30) : [];
    role.revision = (previous?.revision ?? 0) + 1;
    role.savedAt = now;
    if (index < 0)
        result.roles.push(role);
    else
        result.roles[index] = role;
    result.updatedAt = now;
    return result;
}
export function restoreRoleVersion(role: EditorRole, version: RoleVersion): EditorRole { return { ...copyJson(role), ...copyJson(version.body), enabled: version.enabled }; }
export function parseLibrary(text: string): RoleLibrary {
    const parsed: unknown = JSON.parse(text);
    const errors = validateLibrary(parsed);
    if (errors.length)
        throw new Error(errors.slice(0, 12).map(e => e.path + '：' + e.message).join('\n'));
    return parsed as RoleLibrary;
}

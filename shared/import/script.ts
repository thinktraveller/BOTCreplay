import { parseTree, getNodeValue, printParseErrorCode, type Node as JsonNode, type ParseError } from 'jsonc-parser';
import { Ajv } from 'ajv';
import type { JsonValue, RoleType, RuleReference, ScriptSnapshot } from '../domain/contracts.js';
import { getCurrentRule, getExcludedRoles, getSourceRole, getSourceRolesByName, resolveExactRoleId, supportedRoleIds } from '../roles/catalog.js';
import type { EditorRole } from '../roles/editor-model.js';
import { roleName } from '../roles/names.js';

export interface ImportIssue { path: string; message: string; line?: number; column?: number }
export interface RoleVersionOption { key: string; label: string; ability: string; team: string }
export interface RoleVersionConflict { name: string; options: RoleVersionOption[]; selected?: string }
export interface ScriptImport { script?: ScriptSnapshot; errors: ImportIssue[]; warnings: ImportIssue[]; metadata: Record<string, JsonValue>; conflicts: RoleVersionConflict[]; roleCount: number }
export interface ScriptImportOptions { versions?: Record<string, string>; libraryRoles?: readonly EditorRole[] }
const teams = ['townsfolk', 'outsider', 'minion', 'demon'];
const definition = new Ajv({ allErrors: true, strict: true }).compile({ type: 'object', required: ['id', 'name', 'team', 'ability'], properties: {
  id: { type: 'string', minLength: 1, maxLength: 240 }, name: { type: 'string', minLength: 1 }, team: { enum: teams }, ability: { type: 'string' },
  firstNight: { type: 'number', minimum: 0 }, otherNight: { type: 'number', minimum: 0 },
  image: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, reminders: { type: 'array', items: { type: 'string' } }, remindersGlobal: { type: 'array', items: { type: 'string' } },
}, additionalProperties: true });

// Parsing before JSON conversion prevents duplicate properties from silently overwriting facts.
export function parseStrictJson(text: string): { value?: JsonValue; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [], syntax: ParseError[] = [];
  const locate = (offset: number) => { const prefix = text.slice(0, offset).split('\n'); return { line: prefix.length, column: prefix.at(-1)!.length + 1 }; };
  const root = parseTree(text, syntax, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  errors.push(...syntax.map(error => ({ path: '/', message: printParseErrorCode(error.error), ...locate(error.offset) })));
  function check(node: JsonNode, path: string) {
    if(node.type==='number'&&!Number.isFinite(node.value))errors.push({path:path||'/',message:'数值须为有限数值',...locate(node.offset)});
    if (node.type === 'object') {
      const names = new Set<string>();
      for (const property of node.children ?? []) {
        const key = String(property.children?.[0]?.value), value = property.children?.[1];
        if (names.has(key)) errors.push({ path: `${path}/${key}`, message: `重复属性“${key}”`, ...locate(property.offset) });
        names.add(key); if (value) check(value, `${path}/${key}`);
      }
    } else for (const [index, child] of (node.children ?? []).entries()) check(child, `${path}/${index}`);
  }
  if (root) check(root, '');
  return root && !errors.length ? { value: getNodeValue(root) as JsonValue, errors } : { errors };
}

export function importScript(text: string, options: ScriptImportOptions = {}): ScriptImport {
  const parsed = parseStrictJson(text), errors = [...parsed.errors], warnings: ImportIssue[] = [], metadata: Record<string, JsonValue> = {};
  const conflicts: RoleVersionConflict[] = [];
  if (errors.length) return { errors, warnings, metadata, conflicts, roleCount: 0 };
  if (!Array.isArray(parsed.value)) return { errors: [{ path: '/', message: '剧本须为角色数组' }], warnings, metadata, conflicts, roleCount: 0 };
  const script: ScriptSnapshot = { originalJson: text, roles: [], excluded: [] }, ids = new Set<string>(), roleIds = new Set<string>();
  const excluded = new Map(getExcludedRoles().map(item => [item.roleId, item.reason]));
  const excludedNames = new Map(getExcludedRoles().filter(item => item.raw && typeof item.raw === 'object' && 'name' in item.raw).map(item => [roleName(String(item.raw.name)), item.reason]));
  const special = new Set(['dusk', 'dawn', 'minioninfo', 'demoninfo']);
  type Candidate = { key: string; label: string; raw: Record<string, JsonValue>; path: string; canonicalId: string; rule?: RuleReference };
  const groups = new Map<string, Candidate[]>();
  const urls = (raw: Record<string, JsonValue>, path: string) => {
    const images = typeof raw.image === 'string' ? [raw.image] : Array.isArray(raw.image) ? raw.image : [];
    for (const image of images) { try { if (typeof image !== 'string' || !/^(https?:|data:image\/(png|jpeg|webp|svg\+xml);)/i.test(image)) throw Error(); if (!image.startsWith('data:')) { const url = new URL(image); if (url.username || url.password) throw Error(); } } catch { errors.push({ path: `${path}/image`, message: '图标须为无凭据HTTP(S)地址或内嵌图片' }); } }
  };
  parsed.value.forEach((entry, index) => {
    const path = `/${index}`;
    const item = typeof entry === 'string' ? { id: entry } : entry;
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !item.id.trim()) { errors.push({ path, message: '条目需要非空id或已知角色字符串' }); return; }
    const id = item.id;
    if (ids.has(id)) { errors.push({ path: `${path}/id`, message: `角色/元数据id重复：${id}` }); return; } ids.add(id);
    if (id === '_meta') { Object.assign(metadata, item); if (Object.hasOwn(item, 'state')) warnings.push({ path: path + '/state', message: '保留原文，但不启用_meta.state房规' }); return; }
    const incomingName = typeof item.name === 'string' ? roleName(item.name) : undefined;
    if (special.has(id) || excluded.has(id) || (incomingName && excludedNames.has(incomingName)) || ['traveler', 'traveller', 'fabled', 'jinxed'].includes(String(item.team))) {
      const reason = excluded.get(id) ?? (incomingName ? excludedNames.get(incomingName) : undefined) ?? (special.has(id) ? '夜序系统提示，非玩家角色' : '本阶段不支持此角色类型'); script.excluded.push({ id, reason, raw: entry }); warnings.push({ path, message: `${id}：${reason}` }); return;
    }
    // IDs only retrieve a missing name. A supplied name is always the identity match.
    const reference = !incomingName ? resolveExactRoleId(id) : undefined;
    const referenceSource = reference ? getSourceRole(reference) : undefined;
    const configuredReference = !incomingName ? options.libraryRoles?.find(role=>role.enabled&&role.id===id) : undefined;
    const name = incomingName ?? referenceSource?.name ?? (configuredReference ? roleName(configuredReference.name) : undefined);
    const sources = name ? getSourceRolesByName(name) : [];
    const source = sources.length === 1 ? sources[0] : referenceSource;
    const configured = options.libraryRoles?.find(role => role.enabled && name && roleName(role.name) === name);
    const hasDefinition = ['name', 'team', 'ability'].every(key => Object.hasOwn(item, key));
    const base = source ? { ...source, ability: getCurrentRule(source.id)!.abilityText } : configured ? { id: configured.id, name: configured.name, team: configured.team, ability: configured.ability } : undefined;
    if (!base && !incomingName) { errors.push({ path, message: `找不到仅ID角色“${id}”的资料，请提供完整定义` }); return; }
    const raw = (hasDefinition ? { ...item } : { ...base, ...item }) as Record<string, JsonValue>;
    if (!definition(raw)) { errors.push(...(definition.errors ?? []).map(error => ({ path: path + error.instancePath, message: error.message ?? '角色字段无效' }))); return; }
    urls(raw, path);
    const normalized = roleName(String(raw.name));
    const list = groups.get(normalized) ?? [];
    list.push({ key: `imported:${index}`, label: `导入版本（第${index + 1}项）`, raw, path, canonicalId: source?.id ?? configured?.id ?? id });
    groups.set(normalized, list);
  });
  for (const [name, incoming] of groups) {
    const local: Candidate[] = getSourceRolesByName(name).map(source => ({ key: `builtin:${source.id}`, label: '内置版本', raw: { ...source, ability: getCurrentRule(source.id)!.abilityText } as Record<string, JsonValue>, path: incoming[0].path, canonicalId: source.id, rule: getCurrentRule(source.id)! }));
    for (const role of options.libraryRoles ?? []) if (role.enabled && roleName(role.name) === name) local.push({ key: `library:${role.id}`, label: '本地角色配置版本', raw: { id: role.id, name, team: role.team, ability: role.ability }, path: incoming[0].path, canonicalId: local[0]?.canonicalId ?? role.id });
    const candidates = [...local, ...incoming];
    const versions = candidates.filter((candidate, i) => candidates.findIndex(other => other.raw.ability === candidate.raw.ability && other.raw.team === candidate.raw.team) === i);
    const key = options.versions && Object.hasOwn(options.versions, name) ? options.versions[name] : undefined;
    let selected = incoming[0];
    if (versions.length > 1) {
      const chosen = key ? candidates.find(candidate => candidate.key === key) : undefined;
      conflicts.push({ name, options: versions.map(candidate => ({ key: candidate.key, label: candidate.label, ability: String(candidate.raw.ability), team: String(candidate.raw.team) })), ...(chosen ? { selected: versions.find(candidate => candidate.raw.ability === chosen.raw.ability && candidate.raw.team === chosen.raw.team)!.key } : {}) });
      if (!chosen) continue;
      selected = chosen;
    }
    const roleId = selected.canonicalId;
    if (roleIds.has(roleId)) { errors.push({ path: `${selected.path}/id`, message: `不同名称使用了同一角色ID：${roleId}，请修正文件中的ID` }); continue; }
    const raw = selected === incoming[0] || incoming.includes(selected) ? selected.raw : { ...selected.raw, id: incoming[0].raw.id };
    const builtin = local.find(candidate => candidate.rule && candidate.raw.ability === raw.ability && candidate.raw.team === raw.team);
    const rule = builtin?.rule ? { ...builtin.rule, roleId, roleName: name } : { roleId, roleName: name, version: 'imported-manual-v1', abilityText: String(raw.ability), source: selected.key.startsWith('library:') ? 'local-role-library' : 'imported-script', actionReview: { proposalVersion: 'manual', status: 'pending' as const } };
    roleIds.add(roleId);
    script.roles.push({ role: { roleId, name, type: raw.team as RoleType, ruleVersion: rule.version }, raw, currentRule: rule });
  }
  // Explicit night-order lists are optional; unknown player references are still diagnosed.
  for (const key of ['firstNight', 'otherNight']) {
    const sequence = metadata[key];
    if (sequence !== undefined) {
      if (!Array.isArray(sequence) || sequence.some(id => typeof id !== 'string')) errors.push({ path: `/_meta/${key}`, message: '夜序引用须为角色id数组（可为空）' });
      else for (const id of sequence as string[]) if (!special.has(id) && !ids.has(id)) errors.push({ path: `/_meta/${key}`, message: `夜序引用不存在的角色：${id}` });
    }
  }
  if (!groups.size && !errors.length) errors.push({ path: '/', message: '剧本没有可用玩家角色' });
  return { ...(errors.length || conflicts.some(conflict => !conflict.selected) ? {} : { script }), errors, warnings, metadata, conflicts, roleCount: groups.size };
}
export function defaultScriptText() { return JSON.stringify([{ id: '_meta', name: '默认角色库' }, ...supportedRoleIds]); }

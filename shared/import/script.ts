import { parseTree, getNodeValue, printParseErrorCode, type Node as JsonNode, type ParseError } from 'jsonc-parser';
import { Ajv } from 'ajv';
import type { JsonValue, RoleType, ScriptSnapshot } from '../domain/contracts.js';
import { getCurrentRule, getExcludedRoles, getSourceRole, resolveExactRoleId, supportedRoleIds } from '../roles/catalog.js';

export interface ImportIssue { path: string; message: string; line?: number; column?: number }
export interface ScriptImport { script?: ScriptSnapshot; errors: ImportIssue[]; warnings: ImportIssue[]; metadata: Record<string, JsonValue> }
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

export function importScript(text: string): ScriptImport {
  const parsed = parseStrictJson(text), errors = [...parsed.errors], warnings: ImportIssue[] = [], metadata: Record<string, JsonValue> = {};
  if (errors.length) return { errors, warnings, metadata };
  if (!Array.isArray(parsed.value)) return { errors: [{ path: '/', message: '剧本须为角色数组' }], warnings, metadata };
  const script: ScriptSnapshot = { originalJson: text, roles: [], excluded: [] }, ids = new Set<string>(), roleIds = new Set<string>();
  const excluded = new Map(getExcludedRoles().map(item => [item.roleId, item.reason]));
  const special = new Set(['dusk', 'dawn', 'minioninfo', 'demoninfo']);
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
    if (special.has(id) || excluded.has(id) || ['traveler', 'traveller', 'fabled', 'jinxed'].includes(String(item.team))) {
      const reason = excluded.get(id) ?? (special.has(id) ? '夜序系统提示，非玩家角色' : '本阶段不支持此角色类型'); script.excluded.push({ id, reason, raw: entry }); warnings.push({ path, message: `${id}：${reason}` }); return;
    }
    const exact = resolveExactRoleId(id), roleId = exact ?? id, source = exact ? getSourceRole(exact) : undefined;
    if (roleIds.has(roleId)) { errors.push({ path: `${path}/id`, message: `角色解析后重复：${id}（${roleId}）` }); return; }
    const full = ['name', 'team', 'ability'].some(key => Object.hasOwn(item, key));
    let raw = source ? { ...source, ...item } : item;
    if (!source && !full) { errors.push({ path, message: `找不到仅ID角色“${id}”的资料，请提供完整定义` }); return; }
    if (!definition(raw)) { errors.push(...(definition.errors ?? []).map(error => ({ path: path + error.instancePath, message: error.message ?? '角色字段无效' }))); return; }
    raw = raw as Record<string, JsonValue>; urls(raw, path);
    const knownRule=source?getCurrentRule(exact!):undefined,matches=source&&(!full||raw.ability===source.ability||raw.ability===knownRule?.abilityText);
    const rule = matches ? knownRule! : { roleId, roleName: String(raw.name), version: 'imported-manual-v1', abilityText: String(raw.ability), source: 'imported-script', actionReview: { proposalVersion: 'manual', status: 'pending' as const } };
    if (full && source && !matches) warnings.push({ path: path + '/ability', message: '导入技能与内置版本不同，保留导入版本并仅开放人工记录' });
    roleIds.add(roleId);
    script.roles.push({ role: { roleId, name: String(raw.name), type: raw.team as RoleType, ruleVersion: rule.version }, raw: raw as Record<string, JsonValue>, currentRule: rule });
  });
  // Explicit night-order lists are optional; unknown player references are still diagnosed.
  for (const key of ['firstNight', 'otherNight']) {
    const sequence = metadata[key];
    if (sequence !== undefined) {
      if (!Array.isArray(sequence) || sequence.some(id => typeof id !== 'string')) errors.push({ path: `/_meta/${key}`, message: '夜序引用须为角色id数组（可为空）' });
      else for (const id of sequence as string[]) if (!special.has(id) && !ids.has(id)) errors.push({ path: `/_meta/${key}`, message: `夜序引用不存在的角色：${id}` });
    }
  }
  if (!script.roles.length && !errors.length) errors.push({ path: '/', message: '剧本没有可用玩家角色' });
  return { ...(errors.length ? {} : { script }), errors, warnings, metadata };
}
export function defaultScriptText() { return JSON.stringify([{ id: '_meta', name: '默认角色库' }, ...supportedRoleIds]); }

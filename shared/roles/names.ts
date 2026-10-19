export function roleName(name: string): string {
  return name.trim().replace(/[（(]改[）)]$/u, '').trim();
}

export function renameRoleText(text: string): string {
  return text.replaceAll('禁卫军（改）', '禁卫军').replaceAll('禁卫军(改)', '禁卫军')
    .replaceAll('戏子（改）', '戏子').replaceAll('戏子(改)', '戏子');
}

// Current configuration changes its wording; saved version history keeps its original facts.
export function renameCurrentText<T>(value: T): T {
  if (typeof value === 'string') return renameRoleText(value) as T;
  if (Array.isArray(value)) return value.map(item => renameCurrentText(item)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'history' || key === 'originalText' ? item : renameCurrentText(item)])) as T;
  return value;
}

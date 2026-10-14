import type { ReplayPresentation } from '../presentation/types.js';

export interface ViewerBundle { javascript: string; css: string }
export function serializeForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
export function buildStandaloneHtml(replay: ReplayPresentation, bundle: ViewerBundle): string {
  if (Object.values(replay.assets).some(asset => asset.localUrl)) throw new Error('请先将同源图标转换为内嵌资源');
  const title = replay.title.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${title}</title><style>${bundle.css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="app"></div><script type="application/json" id="replay-data">${serializeForHtml(replay)}</script><script>${bundle.javascript.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
}

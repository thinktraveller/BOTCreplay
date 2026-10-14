import { toBlob } from 'html-to-image';
import { EXPORT_LIMITS } from './limits.js';

export interface PngTile { blob: Blob; width: number; height: number; top: number }
export async function* renderPngTiles(element: HTMLElement, signal?: AbortSignal): AsyncGenerator<PngTile> {
  await document.fonts.ready;
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  await Promise.all(Array.from(element.querySelectorAll('img')).map(async image => {
    if (!image.complete) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('角色图标加载超时')), 10_000);
        const loaded = () => finish();
        const failed = () => finish(new Error('角色图标加载失败'));
        function finish(error?: Error) {
          clearTimeout(timer);
          image.removeEventListener('load', loaded);
          image.removeEventListener('error', failed);
          error ? reject(error) : resolve();
        }
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', failed, { once: true });
      });
    }
    if (!image.naturalWidth) throw new Error('角色图标无法解码');
    await image.decode();
  }));
  const width = Math.ceil(element.getBoundingClientRect().width);
  const height = Math.ceil(element.scrollHeight);
  if (width !== EXPORT_LIMITS.width || width * height > EXPORT_LIMITS.totalPixels) {
    throw new Error(`长图超出当前导出预算（宽 ${EXPORT_LIMITS.width}px，最多 ${EXPORT_LIMITS.totalPixels.toLocaleString()} 像素）`);
  }
  const blocks = Array.from(element.querySelectorAll<HTMLElement>('.replay-header, .event-card, .replay-footer'));
  const boundaries = [0];
  let last = 0;
  for (const block of blocks) {
    const top = Math.round(block.getBoundingClientRect().top - element.getBoundingClientRect().top);
    while (top - last > EXPORT_LIMITS.tileHeight) { last += EXPORT_LIMITS.tileHeight; boundaries.push(last); }
    const bottom = top + Math.ceil(block.getBoundingClientRect().height);
    if (bottom - last > EXPORT_LIMITS.tileHeight && top > last) { boundaries.push(top); last = top; }
  }
  while (height - last > EXPORT_LIMITS.tileHeight) { last += EXPORT_LIMITS.tileHeight; boundaries.push(last); }
  if (boundaries[boundaries.length - 1] !== height) boundaries.push(height);
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    signal?.throwIfAborted();
    const top = boundaries[index];
    const tileHeight = boundaries[index + 1] - top;
    // Clone only the blocks intersecting this tile, so a 1000-event DOM is never embedded in one data URL.
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${tileHeight}px;overflow:hidden;background:white;z-index:-1;pointer-events:none`;
    const content = document.createElement('main');
    content.className = element.className;
    content.style.cssText = `position:relative;width:${width}px;height:${tileHeight}px;margin:0`;
    wrapper.append(content);
    for (const block of blocks) {
      const blockTop = Math.round(block.getBoundingClientRect().top - element.getBoundingClientRect().top);
      const blockHeight = Math.ceil(block.getBoundingClientRect().height);
      if (blockTop >= top + tileHeight || blockTop + blockHeight <= top) continue;
      const clone = block.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.top = `${blockTop - top}px`;
      clone.style.left = '0';
      clone.style.width = `${width}px`;
      content.append(clone);
    }
    document.body.append(wrapper);
    try {
      const blob = await toBlob(wrapper, { width, height: tileHeight, pixelRatio: 1, backgroundColor: '#ffffff', skipAutoScale: true, fontEmbedCSS: '', cacheBust: false });
      if (!blob) throw new Error('浏览器未生成图像片段');
      yield { blob, width, height: tileHeight, top };
    } finally { wrapper.remove(); }
  }
}

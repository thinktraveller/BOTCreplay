import type { ReplayPresentation } from '../presentation/types.js';
import { EXPORT_LIMITS } from './limits.js';

export async function embedLocalAssets(replay: ReplayPresentation, signal?: AbortSignal): Promise<ReplayPresentation> {
  const result = structuredClone(replay);
  for (const asset of Object.values(result.assets)) {
    const localUrl = asset.localUrl;
    delete asset.localUrl;
    if (asset.dataUrl || !localUrl) continue;
    try {
      const url = new URL(localUrl, location.href);
      if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) throw new Error('图标必须来自同源缓存');
      const response = await fetch(url, { signal });
      const mediaType = response.headers.get('content-type')?.split(';')[0];
      if (!response.ok || !mediaType || !/^image\/(png|jpeg|webp)$/.test(mediaType) || !response.body) throw new Error('图标格式不可导出');
      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > EXPORT_LIMITS.assetBytes) { await reader.cancel(); throw new Error('图标超过单资源大小上限'); }
          chunks.push(new Uint8Array(value));
        }
      } finally { reader.releaseLock(); }
      const blob = new Blob(chunks, { type: mediaType });
      const image = await createImageBitmap(blob);
      const pixels = image.width * image.height;
      image.close();
      if (pixels > 16_000_000) throw new Error('图标解码尺寸超过预算');
      asset.dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    } catch (error) {
      if (signal?.aborted) throw error;
      asset.label = `${asset.label}（图标不可用）`;
    }
  }
  return result;
}

import sharp from 'sharp';
import { EXPORT_LIMITS } from '../shared/export/limits.js';

export interface InputPngTile { data: Buffer; top: number }
export async function composePngTiles(tiles: InputPngTile[]): Promise<Buffer> {
  if (!tiles.length || tiles.length > EXPORT_LIMITS.maxTiles) throw new Error('图像片段数量超出预算');
  const metadata = await Promise.all(tiles.map(tile => {
    if (tile.data.byteLength > EXPORT_LIMITS.tileBytes) throw new Error('单个图像片段超过大小上限');
    return sharp(tile.data, { limitInputPixels: EXPORT_LIMITS.width * EXPORT_LIMITS.tileHeight }).metadata();
  }));
  let height = 0;
  for (let index = 0; index < tiles.length; index += 1) {
    const info = metadata[index];
    if (info.format !== 'png' || info.width !== EXPORT_LIMITS.width || !info.height || info.height > EXPORT_LIMITS.tileHeight || tiles[index].top !== height) {
      throw new Error('PNG 图像片段宽度、顺序或连续偏移不正确');
    }
    height += info.height;
  }
  if (height * EXPORT_LIMITS.width > EXPORT_LIMITS.totalPixels) throw new Error('输出长图超过总像素预算');
  return sharp({ create: { width: EXPORT_LIMITS.width, height, channels: 4, background: '#ffffff' }, limitInputPixels: EXPORT_LIMITS.totalPixels })
    .composite(tiles.map(tile => ({ input: tile.data, top: tile.top, left: 0 })))
    .png().toBuffer();
}

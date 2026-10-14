// M0 candidate limits. They are explicit budgets, not a claim that every replay is supported.
export const EXPORT_LIMITS = Object.freeze({
  assetBytes: 5 * 1024 * 1024,
  width: 1280,
  tileHeight: 4096,
  totalPixels: 160_000_000,
  tileBytes: 20 * 1024 * 1024,
  maxTiles: 64,
});

// Explicit production guardrails, verified on Windows/Edge with 15 seats and 1000 events.
// They are budgets, not a promise that every input near the ceiling fits available memory.
export const EXPORT_LIMITS = Object.freeze({
  assetBytes: 5 * 1024 * 1024,
  width: 1280,
  tileHeight: 4096,
  totalPixels: 160_000_000,
  tileBytes: 20 * 1024 * 1024,
  maxTiles: 64,
});

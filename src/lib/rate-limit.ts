const hits = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL = 5 * 60_000;

let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - WINDOW_MS;
  for (const [key, timestamps] of hits) {
    const fresh = timestamps.filter((t) => t > cutoff);
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
  }
}

export function rateLimit(
  key: string,
  maxPerMinute: number
): { ok: boolean; remaining: number } {
  cleanup();
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const timestamps = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= maxPerMinute) {
    return { ok: false, remaining: 0 };
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return { ok: true, remaining: maxPerMinute - timestamps.length };
}

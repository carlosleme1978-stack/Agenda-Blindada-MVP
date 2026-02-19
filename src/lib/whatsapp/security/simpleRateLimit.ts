const hits = new Map<string, { count: number; resetAt: number }>();

export function allowHit(key: string, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const cur = hits.get(key);

  if (!cur || cur.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

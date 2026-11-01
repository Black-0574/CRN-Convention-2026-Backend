/**
 * Limiteur de débit minimal, en mémoire (par instance de serveur — pas de coordination entre
 * plusieurs instances). Suffisant pour limiter les abus évidents sur /api/chat, pas une
 * protection anti-DDoS complète.
 */
const hits = new Map<string, number[]>();

export function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    hits.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  hits.set(key, timestamps);
  return false;
}

/**
 * One dot per visitor. A town's people sit in a sunflower spiral round its
 * real position: the first dot is exactly on the spot, the rest fan out so
 * none overlap. The count is the number of dots (past 48 they grow instead).
 */
export const DOT = 3.3; // px: one visitor
const STEP = 8.4; // px between neighbours in the spiral
const MAX_DOTS = 48;
const GOLDEN = 2.399963229728653;
const cache = new Map<number, { pts: { x: number; y: number }[]; dot: number; reach: number }>();

export function swarm(n: number) {
  const hit = cache.get(n);
  if (hit) return hit;
  const count = Math.max(1, Math.min(n, MAX_DOTS));
  const dot = n > MAX_DOTS ? DOT * Math.sqrt(n / MAX_DOTS) : DOT;
  const k = n > MAX_DOTS ? Math.sqrt(n / MAX_DOTS) : 1;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const r = STEP * 0.62 * k * Math.sqrt(i);
    pts.push({ x: r * Math.cos(i * GOLDEN), y: r * Math.sin(i * GOLDEN) });
  }
  const reach = Math.max(...pts.map((p) => Math.hypot(p.x, p.y))) + dot;
  const out = { pts, dot, reach };
  cache.set(n, out);
  return out;
}

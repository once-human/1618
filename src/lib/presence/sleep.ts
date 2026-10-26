/**
 * Working out whether I'm asleep, from nothing but when I was last doing
 * anything. No AI: a few rules on top of the gaps in my activity.
 *
 * Activity is anything that shows I'm up: the laptop in use, music, a push, a
 * saved pin, a status. A quiet gap is sleep when it sits in my night (around
 * my usual bedtime and wake time, learned from the nights I said good night),
 * or, when I haven't really slept in the last day, a long enough quiet gap in
 * the daytime counts as a nap. A night with no gap (I stayed up) is never
 * guessed at, and the next day gets the benefit of the doubt.
 *
 * Honest limit: it only sees what the site sees. Phone use that leaves no
 * trace (scrolling, say) looks like sleep.
 */
export type Burst = [number, number];
export interface PastSleep { at: number; endedAt: number | null }

export type Sleep =
  | { state: "awake" }
  | { state: "away"; since: number }
  | { state: "probably"; since: number }
  | { state: "asleep"; since: number }
  | { state: "nap"; since: number };

export interface Woke { at: number; hours: number }

const MIN = 60_000;
const HOUR = 60 * MIN;
export const PROBABLY_AFTER = 45 * MIN;
export const SURE_AFTER = 2 * HOUR;
const NAP_AFTER = 90 * MIN;
const MAIN_SLEEP = 3.5 * HOUR;

/** Points in time → merged bursts (anything within ten minutes of the last is the same stretch). */
export function bursts(points: number[]): Burst[] {
  const out: Burst[] = [];
  for (const p of [...points].filter(Number.isFinite).sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && p - last[1] < 10 * MIN) last[1] = Math.max(last[1], p);
    else out.push([p, p]);
  }
  return out;
}

const localMin = (ms: number, tz: string) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms)).split(":").map(Number);
  return h * 60 + m;
};

/** My night, in minutes of the day: from two hours before my usual bedtime to two and a half after my usual wake (23:00 and 08:00 until it has learned). */
export function nightWindow(past: PastSleep[], tz: string): [number, number] {
  const beds = past.slice(0, 14).map((p) => (localMin(p.at, tz) - 720 + 1440) % 1440);
  const ups = past.filter((p) => p.endedAt).slice(0, 14).map((p) => (localMin(p.endedAt!, tz) - 720 + 1440) % 1440);
  const avg = (xs: number[], d: number) => (xs.length >= 3 ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length + 720) % 1440 : d);
  const bed = avg(beds, 23 * 60);
  const up = avg(ups, 8 * 60);
  return [(bed - 120 + 1440) % 1440, (up + 150) % 1440];
}

const inWindow = (min: number, [a, b]: [number, number]) => (a <= b ? min >= a && min < b : min >= a || min < b);

/** How much of a stretch falls in my night (0 to 1), sampled every ten minutes. */
function nightShare(from: number, to: number, win: [number, number], tz: string): number {
  let n = 0;
  let hit = 0;
  for (let t = from; t < to; t += 10 * MIN) {
    n++;
    if (inWindow(localMin(t, tz), win)) hit++;
  }
  return n ? hit / n : 0;
}

interface Gap { from: number; to: number; ongoing: boolean }

function gapsOf(b: Burst[], now: number, since: number): Gap[] {
  const gaps: Gap[] = [];
  let prev = since;
  for (const [s, e] of b) {
    if (s - prev >= PROBABLY_AFTER) gaps.push({ from: prev, to: s, ongoing: false });
    prev = Math.max(prev, e);
  }
  if (now - prev >= PROBABLY_AFTER) gaps.push({ from: prev, to: now, ongoing: true });
  return gaps;
}

/** The state now, and (if I got up from a night's sleep in the last few hours) when. */
export function sleepNow(input: { now: number; tz: string; bursts: Burst[]; past: PastSleep[] }): { sleep: Sleep; woke: Woke | null } {
  const { now, tz, past } = input;
  const b = input.bursts.filter(([, e]) => e <= now + 5 * MIN);
  if (!b.length) return { sleep: { state: "awake" }, woke: null };
  const win = nightWindow(past, tz);
  const lookback = now - 40 * HOUR;
  // Before the first burst we know nothing, so gaps start at the first thing seen.
  const gaps = gapsOf(b, now, Math.max(lookback, b[0][0]));
  const isMain = (g: Gap) => g.to - g.from >= MAIN_SLEEP && nightShare(g.from, g.to, win, tz) >= 0.5;
  const main = gaps.filter(isMain);
  const cur = gaps.find((g) => g.ongoing) ?? null;

  // Woke from a night's sleep within the last three hours.
  const woken = main.filter((g) => !g.ongoing && now - g.to < 3 * HOUR).pop();
  const woke = woken ? { at: woken.to, hours: Math.round(((woken.to - woken.from) / HOUR) * 2) / 2 } : null;

  if (!cur) return { sleep: { state: "awake" }, woke };
  const len = now - cur.from;
  const share = nightShare(cur.from, now, win, tz);
  const atNight = share >= 0.5 || inWindow(localMin(now, tz), win);
  if (atNight && share > 0) {
    return { sleep: { state: len >= SURE_AFTER ? "asleep" : "probably", since: cur.from }, woke: null };
  }
  // Daytime: only a sleep-starved day makes a long quiet stretch a nap.
  const sleptSince = main.some((g) => g.to > now - 26 * HOUR && (g.ongoing || g.to <= cur.from));
  const hour = localMin(now, tz) / 60;
  // No history to go on (it hasn't seen the last night) is not a reason to say nap.
  const knowsLastNight = b[0][0] <= now - 18 * HOUR;
  if (knowsLastNight && !sleptSince && hour >= 6 && hour < 22 && len >= NAP_AFTER) return { sleep: { state: "nap", since: cur.from }, woke: null };
  return { sleep: { state: "away", since: cur.from }, woke: null };
}

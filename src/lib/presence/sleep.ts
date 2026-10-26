/**
 * Whether I'm asleep, worked out from nothing but when I was last doing
 * anything. No AI: rules on top of the gaps in my activity.
 *
 * Activity is anything that shows I'm up: the laptop in use, music, a push, a
 * saved pin, a status. My night is 23:00 to 10:00, always, widened by when I
 * actually go to bed and get up (learned from the nights I said good night).
 * - Quiet in the night: "probably asleep" after 45 minutes, asleep after two hours.
 * - Quiet in the day: out somewhere. Unless I didn't sleep last night: then
 *   ninety quiet minutes is a crash.
 * - Up through the night with no real sleep: an all-nighter, said out loud.
 *
 * Honest limit: it only sees what the site sees. Phone use that leaves no
 * trace (scrolling, say) looks like sleep.
 */
export type Burst = [number, number];
export interface PastSleep { at: number; endedAt: number | null }

export type SleepState =
  | "awake" // doing things
  | "late" // doing things, after 1 am, not slept yet
  | "allnighter" // doing things, morning, no sleep since yesterday
  | "probably" // quiet 45 min+ in the night
  | "asleep" // quiet 2 h+ in the night
  | "crashed" // quiet 90 min+ in the day after no sleep
  | "out"; // quiet in the day

export interface SleepNow {
  state: SleepState;
  /** When the quiet began (for the quiet states). */
  since: number | null;
  /** Got up from a real sleep in the last three hours. */
  woke: { at: number; hours: number } | null;
  /** No real sleep in the last day (knows enough history to say so). */
  noSleep: boolean;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
export const PROBABLY_AFTER = 45 * MIN;
export const SURE_AFTER = 2 * HOUR;
const CRASH_AFTER = 90 * MIN;
const MAIN_SLEEP = 3 * HOUR;
const FIXED: [number, number] = [23 * 60, 10 * 60];

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

export const localMin = (ms: number, tz: string) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms)).split(":").map(Number);
  return h * 60 + m;
};

/** The learned night (two hours before my usual bedtime to two and a half after my usual wake), once there are three nights to learn from. */
export function learnedWindow(past: PastSleep[], tz: string): [number, number] | null {
  const fromNoon = (ms: number) => (localMin(ms, tz) - 720 + 1440) % 1440;
  const beds = past.slice(0, 14).map((p) => fromNoon(p.at));
  const ups = past.filter((p) => p.endedAt).slice(0, 14).map((p) => fromNoon(p.endedAt!));
  if (beds.length < 3) return null;
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length + 720) % 1440;
  const bed = avg(beds);
  const up = ups.length >= 3 ? avg(ups) : 8 * 60;
  return [(bed - 120 + 1440) % 1440, (up + 150) % 1440];
}

const inRange = (min: number, [a, b]: [number, number]) => (a <= b ? min >= a && min < b : min >= a || min < b);

export function nightTest(past: PastSleep[], tz: string) {
  const learned = learnedWindow(past, tz);
  return (ms: number) => {
    const m = localMin(ms, tz);
    return inRange(m, FIXED) || (learned ? inRange(m, learned) : false);
  };
}

/** How much of a stretch falls in my night (0 to 1), sampled every ten minutes. */
function share(from: number, to: number, isNight: (ms: number) => boolean): number {
  let n = 0;
  let hit = 0;
  for (let t = from; t < to; t += 10 * MIN) {
    n++;
    if (isNight(t)) hit++;
  }
  return n ? hit / n : 0;
}

export interface Gap { from: number; to: number; ongoing: boolean }

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

interface Input { now: number; tz: string; bursts: Burst[]; past: PastSleep[] }

function prepare({ now, tz, bursts: raw, past }: Input) {
  const b = raw.filter(([, e]) => e <= now + 5 * MIN);
  const isNight = nightTest(past, tz);
  const start = b.length ? Math.max(now - 40 * HOUR, b[0][0]) : now;
  const gaps = b.length ? gapsOf(b, now, start) : [];
  const isMain = (g: Gap) => g.to - g.from >= MAIN_SLEEP && share(g.from, g.to, isNight) >= 0.5;
  return { b, isNight, gaps, isMain, knowsFrom: b.length ? b[0][0] : now };
}

export function sleepNow(input: Input): SleepNow {
  const { now, tz } = input;
  const { b, isNight, gaps, isMain, knowsFrom } = prepare(input);
  if (!b.length) return { state: "awake", since: null, woke: null, noSleep: false };
  const main = gaps.filter(isMain);
  const cur = gaps.find((g) => g.ongoing) ?? null;
  const hour = localMin(now, tz) / 60;

  // Didn't sleep: no real sleep that ended (or is going on) in the last 22 hours, and it has watched long enough to know.
  const sleptRecently = main.some((g) => g.ongoing || g.to > now - 22 * HOUR);
  const noSleep = knowsFrom <= now - 12 * HOUR && !sleptRecently && hour >= 4 && hour < 22;

  const woken = main.filter((g) => !g.ongoing && now - g.to < 3 * HOUR).pop();
  const woke = woken && !cur ? { at: woken.to, hours: Math.round(((woken.to - woken.from) / HOUR) * 2) / 2 } : null;

  if (!cur) {
    if (noSleep && hour >= 4 && hour < 11) return { state: "allnighter", since: null, woke: null, noSleep };
    const sleptTonight = main.some((g) => g.to > now - 12 * HOUR);
    if (!sleptTonight && (hour >= 1 && hour < 5)) return { state: "late", since: null, woke, noSleep };
    return { state: "awake", since: null, woke, noSleep };
  }
  const len = now - cur.from;
  // Only the quiet inside the night counts towards sleep: quiet from 21:55 is 5 minutes of night quiet at 23:00, not an hour.
  let nightStart = now;
  while (nightStart > cur.from && isNight(nightStart - 10 * MIN)) nightStart -= 10 * MIN;
  const nightQuiet = now - Math.max(cur.from, nightStart);
  if (isNight(now) && nightQuiet >= PROBABLY_AFTER) {
    return { state: nightQuiet >= SURE_AFTER ? "asleep" : "probably", since: cur.from, woke: null, noSleep };
  }
  if (!isNight(now) && share(cur.from, now, isNight) >= 0.5 && len >= PROBABLY_AFTER) {
    // Went quiet in the night and still quiet into the morning: still asleep.
    return { state: len >= SURE_AFTER ? "asleep" : "probably", since: cur.from, woke: null, noSleep };
  }
  if (noSleep && len >= CRASH_AFTER) return { state: "crashed", since: cur.from, woke: null, noSleep };
  return { state: "out", since: cur.from, woke: null, noSleep };
}

/** For the timeline: every real sleep in the window, and every night I didn't sleep at all. */
export function nightsIn(input: Input): ({ kind: "slept"; from: number; to: number; ongoing: boolean } | { kind: "allnighter"; at: number })[] {
  const { now, tz } = input;
  const { b, isNight, gaps, isMain } = prepare(input);
  const out: ({ kind: "slept"; from: number; to: number; ongoing: boolean } | { kind: "allnighter"; at: number })[] = gaps
    .filter((g) => isMain(g) || (g.ongoing && g.to - g.from >= SURE_AFTER && isNight(g.to)))
    .map((g) => ({ kind: "slept" as const, ...g }));
  // A night with activity in at least three of the hours 01:00–06:00 and no real sleep between 21:00 and 11:00 is an all-nighter.
  const seen = new Map<string, Set<number>>();
  for (const [s, e] of b)
    for (let t = s; t <= e; t += 10 * MIN) {
      const m = localMin(t, tz);
      if (m >= 60 && m < 360) {
        const key = new Date(t - 12 * HOUR).toISOString().slice(0, 10);
        (seen.get(key) ?? seen.set(key, new Set()).get(key)!).add(Math.floor(m / 60));
      }
    }
  for (const [key, hours] of seen) {
    if (hours.size < 3) continue;
    const mid = Date.parse(`${key}T12:00:00Z`) + 12 * HOUR; // around midnight UTC of that night: good enough to bound it
    const slept = out.some((n) => n.kind === "slept" && n.from < mid + 14 * HOUR && n.to > mid - 6 * HOUR);
    if (!slept) {
      const last = b.filter(([s]) => s < mid + 12 * HOUR && s > mid).pop();
      out.push({ kind: "allnighter", at: Math.min(now, last ? last[1] : mid + 6 * HOUR) });
    }
  }
  return out;
}

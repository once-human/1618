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
/** Shorter than this, night or day, it wasn't sleep and isn't noted. */
export const MIN_SLEEP = HOUR;
/** How long the site says "in bed" after a good night (see presence/bedtime.ts). */
const BED_MS = 7 * HOUR;
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
export function learnedWindow(allPast: PastSleep[], tz: string): [number, number] | null {
  // A good night I was up from within the hour wasn't a night's sleep: it says nothing about when I sleep.
  const past = allPast.filter((p) => !p.endedAt || p.endedAt - p.at >= MIN_SLEEP);
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

interface Input { now: number; tz: string; bursts: Burst[]; past: PastSleep[]; horizon?: number }

function prepare({ now, tz, bursts: raw, past, horizon = 40 * HOUR }: Input) {
  const b = raw.filter(([, e]) => e <= now + 5 * MIN);
  const isNight = nightTest(past, tz);
  const start = b.length ? Math.max(now - horizon, b[0][0]) : now;
  const gaps = b.length ? gapsOf(b, now, start) : [];
  // Quiet at the laptop isn't sleep if I said good night soon after it ended: I was up, just somewhere else.
  const wentToBedAfter = (g: Gap) => !g.ongoing && past.some((p) => p.at >= g.to - 5 * MIN && p.at - g.to < 2 * HOUR);
  const isMain = (g: Gap) => g.to - g.from >= MAIN_SLEEP && share(g.from, g.to, isNight) >= 0.5 && !wentToBedAfter(g);
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
    if (noSleep && hour >= 7 && hour < 11) return { state: "allnighter", since: null, woke: null, noSleep };
    const sleptTonight = main.some((g) => g.to > now - 12 * HOUR);
    if (!sleptTonight && (hour >= 1 && hour < 7)) return { state: "late", since: null, woke, noSleep };
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

/** A night I said good night to ("Hey Siri, good night"), and when I said good morning or got up, if I did. */
export interface Told { at: number; ended: number | null }

export type Night =
  /** A sleep of at least an hour. `goodNight` is when I said so, if I did; `upAt` when I got up (null while it's still going). */
  | { kind: "slept"; from: number; to: number; ongoing: boolean; told: boolean; goodNight: number | null; upAt: number | null }
  /** Said good night but stayed up (or was up again within the hour): not a sleep. */
  | { kind: "restless"; at: number; upAt: number | null }
  /** Still up after 7 am with no sleep since the evening before. `at` is that night's midnight. */
  | { kind: "allnighter"; at: number };

const localDate = (ms: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ms));

/**
 * For the timeline: every sleep of an hour or more, every good night that
 * didn't turn into sleep, and every night I never slept. Pass `bursts` of
 * things only I do (the laptop in use, pushes, pins), not music: I fall asleep
 * to it, so it can't say I'm up.
 *
 * - A good night starts a sleep once I've been quiet an hour: anything I do
 *   within the hour after it (or after the last thing I did) means I wasn't
 *   asleep yet. The sleep ends at good morning, or the next thing I do.
 * - Under an hour, night or day, isn't sleep: it's shown as "said good night,
 *   didn't sleep".
 * - Quiet that I didn't say good night to counts only if it's long, at night.
 * - An all-nighter needs me up in at least three of the hours 01–06 and still
 *   doing things after 07:00, with no sleep in between. It's set at that
 *   night's midnight, so it sits in the same day as the night.
 */
export function nightsIn(input: Input & { told?: Told[] }): Night[] {
  const { now, tz } = input;
  const { b, isNight, gaps, isMain } = prepare(input);
  const told = [...(input.told ?? [])].sort((x, y) => x.at - y.at);
  const out: Night[] = [];

  told.forEach((t, i) => {
    const next = told[i + 1]?.at ?? Infinity;
    let cur = t.at; // when I actually went quiet
    for (const [s, e] of b) {
      if (e <= cur) continue;
      if (s - cur < MIN_SLEEP) cur = Math.max(cur, e);
      else break;
    }
    const wake = b.find(([s]) => s > cur)?.[0] ?? Infinity;
    // Ends at good morning or the next thing I do; with neither, the site's own seven hours.
    const known = Math.min(t.ended ?? Infinity, wake, next);
    const stop = known < Infinity ? known : cur + BED_MS;
    const ongoing = stop > now;
    const end = ongoing ? now : stop;
    const up = t.ended ?? (wake < Infinity ? wake : null);
    if (end - cur < MIN_SLEEP) {
      if (ongoing && end >= t.at) out.push({ kind: "slept", from: t.at, to: now, ongoing: true, told: true, goodNight: t.at, upAt: null });
      else out.push({ kind: "restless", at: t.at, upAt: up });
      return;
    }
    out.push({ kind: "slept", from: cur, to: end, ongoing, told: true, goodNight: t.at, upAt: ongoing ? null : end });
  });

  for (const g of gaps) {
    if (!(isMain(g) || (g.ongoing && g.to - g.from >= SURE_AFTER && isNight(g.to)))) continue;
    if (told.some((t) => t.at >= g.from - 3 * HOUR && t.at <= g.to + 2 * HOUR)) continue; // the good night says it better
    out.push({ kind: "slept", from: g.from, to: g.to, ongoing: g.ongoing, told: false, goodNight: null, upAt: g.ongoing ? null : g.to });
  }

  const days = new Map<string, { hours: Set<number>; after7: boolean; ref: number }>();
  for (const [s, e] of b)
    for (let t = s; t <= e; t += 10 * MIN) {
      const m = localMin(t, tz);
      const d = localDate(t, tz);
      const x = days.get(d) ?? days.set(d, { hours: new Set(), after7: false, ref: t }).get(d)!;
      if (m >= 60 && m < 360) x.hours.add(Math.floor(m / 60));
      if (m >= 420 && m < 720) x.after7 = true;
    }
  for (const x of days.values()) {
    if (x.hours.size < 3 || !x.after7) continue;
    const midnight = Math.round((x.ref - localMin(x.ref, tz) * MIN) / MIN) * MIN;
    const slept = out.some((n) => n.kind === "slept" && n.from < midnight + 7 * HOUR && n.to > midnight - 3 * HOUR);
    if (!slept) out.push({ kind: "allnighter", at: midnight });
  }
  return out;
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { bursts, nightsIn, sleepNow, withMusic } from "./sleep";

const TZ = "Asia/Kolkata";
// IST helper: day 0 = 2026-10-26.
const at = (d: number, h: number, m = 0) => Date.UTC(2026, 9, 26 + d, h, m) - 5.5 * 3600_000;
const input = (pts: number[], now: number) => ({ now, tz: TZ, bursts: bursts(pts), past: [] });
const run = (pts: number[], now: number) => sleepNow(input(pts, now));
const every = (from: number, to: number, step = 5 * 60_000) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

test("45 minutes of quiet at night is probably sleep, two hours is sleep", () => {
  const pts = every(at(0, 20), at(0, 23, 30));
  assert.equal(run(pts, at(0, 23, 30) + 50 * 60_000).state, "probably");
  assert.equal(run(pts, at(0, 23, 30) + 130 * 60_000).state, "asleep");
});
test("quiet at 9 am still counts as night (fixed window till 10)", () => {
  const pts = [...every(at(-1, 10), at(-1, 23)), ...every(at(0, 7), at(0, 8))];
  assert.equal(run(pts, at(0, 9)).state, "probably");
});
test("quiet in the daytime after a night's sleep is out", () => {
  const pts = [...every(at(0, 18), at(0, 23, 30)), ...every(at(1, 8), at(1, 13))];
  assert.equal(run(pts, at(1, 15)).state, "out");
});
test("an all-nighter is called, and the next day's quiet is a crash", () => {
  const pts = every(at(0, 18), at(1, 9));
  assert.equal(run(pts, at(1, 9)).state, "allnighter");
  const more = [...pts, ...every(at(1, 10), at(1, 12))];
  assert.equal(run(more, at(1, 14)).state, "crashed");
  assert.ok(nightsIn(input(more, at(1, 14))).some((n) => n.kind === "allnighter"));
});
test("still up after 1 am, not slept yet", () => {
  const pts = every(at(0, 18), at(1, 2));
  assert.equal(run(pts, at(1, 2)).state, "late");
});
test("getting up from a night's sleep is noticed", () => {
  const pts = [...every(at(0, 18), at(0, 23, 30)), ...every(at(1, 7, 30), at(1, 8))];
  const r = run(pts, at(1, 8, 5));
  assert.equal(r.state, "awake");
  assert.equal(r.woke?.hours, 8);
  assert.equal(nightsIn(input(pts, at(1, 8, 5)))[0].kind, "slept");
});

// ---- good nights, the one-hour minimum, and all-nighters ----
const night = (pts: number[], now: number, told: { at: number; ended: number | null }[], past: { at: number; endedAt: number | null }[] = []) =>
  nightsIn({ now, tz: TZ, bursts: bursts(pts), past, told });

test("a good night I was up from within the hour is not sleep", () => {
  const gn = at(1, 3, 42);
  const n = night(every(at(0, 20), at(1, 3, 40)), at(1, 4, 14), [{ at: gn, ended: at(1, 4, 8) }]);
  assert.equal(n.filter((x) => x.kind === "slept").length, 0);
  const r = n.find((x) => x.kind === "restless");
  assert.ok(r && r.kind === "restless" && r.at === gn && r.upAt === at(1, 4, 8));
});
test("a good night followed by real quiet is a sleep that starts when I went quiet", () => {
  const gn = at(0, 23, 30);
  // Still working until 00:20, then nothing until 08:00.
  const pts = [...every(at(0, 20), at(1, 0, 20)), ...every(at(1, 8), at(1, 9))];
  const n = night(pts, at(1, 9, 30), [{ at: gn, ended: null }]);
  const s = n.find((x) => x.kind === "slept");
  assert.ok(s && s.kind === "slept" && s.told);
  assert.equal(s.from, at(1, 0, 20));
  assert.equal(s.to, at(1, 8));
  assert.equal(s.goodNight, gn);
});
test("good morning ends a sleep, and under an hour it never counted", () => {
  const gn = at(0, 23, 30);
  const long = night(every(at(0, 20), at(0, 23, 30)), at(1, 9), [{ at: gn, ended: at(1, 7) }]);
  assert.ok(long.some((x) => x.kind === "slept" && x.to === at(1, 7)));
  const short = night(every(at(0, 20), at(0, 23, 30)), at(1, 9), [{ at: gn, ended: at(0, 23, 55) }]);
  assert.ok(short.some((x) => x.kind === "restless"));
  assert.ok(!short.some((x) => x.kind === "slept"));
});
test("a daytime good night under an hour isn't noted either", () => {
  const gn = at(1, 14);
  const n = night(every(at(1, 10), at(1, 14)), at(1, 17), [{ at: gn, ended: at(1, 14, 40) }]);
  assert.ok(!n.some((x) => x.kind === "slept"));
});
test("no all-nighter before 7 am, then one at that night's midnight", () => {
  const pts = every(at(0, 18), at(1, 6, 30));
  assert.ok(!night(pts, at(1, 6, 30), []).some((x) => x.kind === "allnighter"));
  assert.equal(run(pts, at(1, 6, 30)).state, "late");
  const morning = [...pts, ...every(at(1, 7), at(1, 8))];
  const a = night(morning, at(1, 8), []).find((x) => x.kind === "allnighter");
  assert.ok(a && a.kind === "allnighter");
  assert.equal(a.at, at(1, 0));
  assert.equal(run(morning, at(1, 8)).state, "allnighter");
});
test("a sleep of an hour or more cancels the all-nighter", () => {
  // Up through 01:00–03:59, said good night at 04:00, quiet until working again at 07:10.
  const pts = [...every(at(0, 18), at(1, 3, 59)), ...every(at(1, 7, 10), at(1, 8))];
  const n = night(pts, at(1, 8), [{ at: at(1, 4), ended: null }]);
  assert.ok(n.some((x) => x.kind === "slept" && x.told));
  assert.ok(!n.some((x) => x.kind === "allnighter"));
});
test("quiet at the laptop that ends with a good night was not sleep", () => {
  // Away from 00:40 to 03:40, back, said good night at 03:42.
  const pts = [...every(at(0, 18), at(1, 0, 40)), ...every(at(1, 3, 40), at(1, 3, 42))];
  const past = [{ at: at(1, 3, 42), endedAt: at(1, 4, 8) }];
  const r = sleepNow({ now: at(1, 4, 14), tz: TZ, bursts: bursts([...pts, ...every(at(1, 4, 8), at(1, 4, 14))]), past });
  assert.equal(r.woke, null);
});

test("music for the half hour after I stop is falling asleep to it; after that I'm up", () => {
  const hands = every(at(0, 20), at(0, 23));
  // Songs every four minutes from 23:00.
  const shortMusic = every(at(0, 23, 4), at(0, 23, 28), 4 * 60_000);
  assert.deepEqual(withMusic(hands, shortMusic), bursts(hands));
  const longMusic = every(at(0, 23, 4), at(1, 1), 4 * 60_000);
  const b = withMusic(hands, longMusic);
  assert.equal(b[b.length - 1][1] > at(1, 0, 50), true); // still going at 1 am: up
  assert.equal(b.some(([s, e]) => s <= at(0, 23, 20) && e >= at(0, 23, 20) && s > at(0, 23)), false); // the first half hour doesn't count
});
test("music that starts while I'm already quiet gets its own half hour", () => {
  const hands = every(at(0, 20), at(0, 21));
  const m = every(at(0, 23), at(0, 23, 28), 4 * 60_000);
  assert.deepEqual(withMusic(hands, m), bursts(hands));
});
test("a night of music alone is still a sleep", () => {
  const hands = every(at(0, 20), at(0, 23, 30));
  const music = every(at(0, 23, 34), at(0, 23, 58), 4 * 60_000); // an album's first half hour
  const n = night(withMusic(hands, music).flat(), at(1, 9), [{ at: at(0, 23, 31), ended: null }]);
  void n;
  const nn = nightsIn({ now: at(1, 9), tz: TZ, bursts: withMusic(hands, music), past: [], told: [{ at: at(0, 23, 31), ended: at(1, 7) }] });
  assert.ok(nn.some((x) => x.kind === "slept" && x.told));
});
test("quiet in the day after an all-nighter is a nap; after a night I slept it's just being out", () => {
  const up = [...every(at(0, 18), at(1, 8)), ...every(at(1, 11), at(1, 12))];
  const after = nightsIn({ now: at(1, 16), tz: TZ, bursts: bursts(up), past: [] });
  const nap = after.find((x) => x.kind === "nap");
  assert.ok(nap && nap.kind === "nap" && nap.from === at(1, 8));
  const slept = [...every(at(0, 18), at(0, 23, 30)), ...every(at(1, 7), at(1, 8)), ...every(at(1, 11), at(1, 12))];
  assert.ok(!nightsIn({ now: at(1, 16), tz: TZ, bursts: bursts(slept), past: [] }).some((x) => x.kind === "nap"));
});

test("a good night shows at once, and turns into 'didn't sleep' if I'm still working half an hour later", () => {
  const gn = at(1, 3, 42);
  const pts = every(at(0, 20), at(1, 4, 20));
  const soon = night(pts.filter((t) => t <= at(1, 3, 50)), at(1, 3, 50), [{ at: gn, ended: null }]);
  assert.ok(soon.some((x) => x.kind === "slept" && x.ongoing && x.told)); // "Said good night"
  const later = night(pts, at(1, 4, 20), [{ at: gn, ended: null }]);
  assert.ok(later.some((x) => x.kind === "restless"));
  assert.ok(!later.some((x) => x.kind === "slept"));
});

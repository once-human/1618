import assert from "node:assert/strict";
import { test } from "node:test";
import { bursts, nightsIn, sleepNow } from "./sleep";

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

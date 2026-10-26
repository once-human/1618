import assert from "node:assert/strict";
import { test } from "node:test";
import { bursts, sleepNow } from "./sleep";

const TZ = "Asia/Kolkata";
// IST helper: day 0 = 2026-10-26.
const at = (d: number, h: number, m = 0) => Date.UTC(2026, 9, 26 + d, h, m) - 5.5 * 3600_000;
const run = (pts: number[], now: number) => sleepNow({ now, tz: TZ, bursts: bursts(pts), past: [] });
const every = (from: number, to: number, step = 5 * 60_000) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

test("45 minutes of quiet at night is probably sleep, two hours is sleep", () => {
  const pts = every(at(0, 20), at(0, 23, 30));
  assert.equal(run(pts, at(0, 23, 30) + 50 * 60_000).sleep.state, "probably");
  assert.equal(run(pts, at(0, 23, 30) + 130 * 60_000).sleep.state, "asleep");
});
test("quiet in the daytime is just away", () => {
  const pts = every(at(0, 8), at(0, 13));
  assert.equal(run(pts, at(0, 15)).sleep.state, "away");
});
test("an all-nighter makes the next day's long quiet a nap", () => {
  const pts = [...every(at(0, 18), at(1, 9)), ...every(at(1, 9, 30), at(1, 11))];
  assert.equal(run(pts, at(1, 13, 30)).sleep.state, "nap");
});
test("after a real night, the day's quiet is not a nap", () => {
  const pts = [...every(at(0, 18), at(0, 23, 30)), ...every(at(1, 7), at(1, 11))];
  assert.equal(run(pts, at(1, 14)).sleep.state, "away");
});
test("getting up from a night's sleep is noticed", () => {
  const pts = [...every(at(0, 18), at(0, 23, 30)), ...every(at(1, 7, 30), at(1, 8))];
  const r = run(pts, at(1, 8, 5));
  assert.equal(r.sleep.state, "awake");
  assert.equal(r.woke?.hours, 8);
});

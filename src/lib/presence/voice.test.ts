import assert from "node:assert/strict";
import { test } from "node:test";
import { doingLine, dur, quietLine, wokeLine } from "./voice";

test("durations read like a person says them", () => {
  assert.equal(dur(2 * 60_000), "a few minutes");
  assert.equal(dur(22 * 60_000), "20 minutes");
  assert.equal(dur(70 * 60_000), "an hour");
  assert.equal(dur(150 * 60_000), "2½ hours");
});
test("lines fill in, and the same seed gives the same line", () => {
  const d = { kind: "claude" as const, label: "Working with Claude Code", detail: "1618" };
  const a = doingLine(d, 10 * 60_000, "x");
  assert.ok(a.includes("1618") && !a.includes("{"));
  assert.equal(a, doingLine(d, 10 * 60_000, "x"));
  assert.ok(doingLine(d, 3 * 3600_000, "x").includes("1618"));
  assert.ok(!quietLine("asleep", "01:40", 3 * 3600_000, "y").includes("{"));
  assert.ok(wokeLine("08:10", 4, "z").includes("4h"));
});
test("YouTube is never more than YouTube", () => {
  const line = doingLine({ kind: "watching", label: "Watching YouTube", detail: null }, 5 * 60_000, "s");
  assert.ok(/YouTube/.test(line));
});

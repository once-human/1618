import { test } from "node:test";
import assert from "node:assert/strict";
import { inBed, typicalBedtime } from "./presence/asleep";
import type { Presence } from "./presence/types";

const at = "2026-10-18T19:42:00.000Z"; // 01:12 in Pune
const bedAt = Date.parse(at);
const base = {
  github: null,
  repos: {},
  place: { city: "Pune", tz: "Asia/Kolkata" },
  weather: null,
  status: null,
  health: null,
  fetchedAt: at,
  bedtime: { at, until: new Date(bedAt + 5 * 3600_000).toISOString(), via: "siri" },
} satisfies Presence;

test("went to bed holds for five hours", () => {
  assert.ok(inBed(base, bedAt + 4.9 * 3600_000));
  assert.equal(inBed(base, bedAt + 5 * 3600_000), null);
});

test("it ends early when I clearly got up: a later status, push or pin", () => {
  const later = new Date(bedAt + 40 * 60_000).toISOString();
  const now = bedAt + 3600_000;
  assert.equal(inBed({ ...base, status: { text: "can't sleep", setAt: later, until: later } }, now), null);
  assert.equal(inBed({ ...base, github: { repo: "1618", url: "", action: "Pushed", message: null, at: later } }, now), null);
  assert.equal(inBed(base, now, later), null);
});

test("a status from before bed, or a pin just after, doesn't end it", () => {
  const before = new Date(bedAt - 3600_000).toISOString();
  const soon = new Date(bedAt + 5 * 60_000).toISOString();
  const now = bedAt + 3600_000;
  assert.ok(inBed({ ...base, status: { text: "out", setAt: before, until: soon } }, now));
  assert.ok(inBed(base, now, soon));
});

test("the usual bedtime averages across midnight", () => {
  assert.equal(typicalBedtime(["2026-10-17T18:10:00Z", "2026-10-18T18:50:00Z"]), "00:00"); // 23:40 and 00:20
  assert.equal(typicalBedtime(["2026-10-18T19:42:00Z"]), "01:12");
  assert.equal(typicalBedtime([]), null);
});

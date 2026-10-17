import { test } from "node:test";
import assert from "node:assert/strict";
import { skyAt } from "./sky";

const H = 3600_000;
const day0 = Date.UTC(2026, 9, 17, 0, 0); // a reference day
const sun = [{ rise: day0 + 6.5 * H, set: day0 + 18.2 * H }];

const contrast = (a: string, b: string) => {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("noon is plain white paper and black ink", () => {
  const s = skyAt(day0 + 12 * H, sun);
  assert.equal(s.phase, "day");
  assert.equal(s.paper, "#ffffff");
  assert.equal(s.ink, "#000000");
});

test("midnight is dark, with stars when it's clear", () => {
  const s = skyAt(day0 + 0.5 * H, sun, { cloud: 10 });
  assert.equal(s.phase, "night");
  assert.ok(s.stars);
  assert.ok(!skyAt(day0 + 0.5 * H, sun, { cloud: 90 }).stars);
});

test("sunset is warm", () => {
  const s = skyAt(day0 + 18.2 * H, sun);
  assert.equal(s.phase, "dusk");
  assert.notEqual(s.paper, "#ffffff");
});

test("text always reads, at every minute of the day, in any weather", () => {
  for (const w of [{}, { cloud: 100 }, { rain: true, cloud: 100 }]) {
    for (let m = 0; m < 24 * 60; m += 5) {
      const s = skyAt(day0 + m * 60_000, sun, w);
      assert.ok(contrast(s.paper, s.ink) >= 7, `ink at ${m} min: ${s.paper}/${s.ink}`);
      assert.ok(contrast(s.paper, s.quiet) >= 2.5, `quiet at ${m} min: ${s.paper}/${s.quiet}`);
    }
  }
});

test("no sun times means plain day colours", () => {
  assert.equal(skyAt(day0, []).paper, "#ffffff");
});

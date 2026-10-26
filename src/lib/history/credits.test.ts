import { test } from "node:test";
import assert from "node:assert/strict";
import { nameKey, parseCredit, splitCredit } from "./credits";

// Invented names only: these are rules, not a list of songs.

test("names differing only in case, accents or punctuation are one artist", () => {
  assert.equal(nameKey("Lune again.."), nameKey("LUNE AGAIN.."));
  assert.equal(nameKey("Café Ränd"), nameKey("cafe rand"));
});

test("credits split into individual artists", () => {
  assert.deepEqual(splitCredit("Mira & Lune again.."), ["Mira", "Lune again.."]);
  assert.deepEqual(splitCredit("Ostra, Pell & Quin"), ["Ostra", "Pell", "Quin"]);
  assert.deepEqual(splitCredit("Ostra x Pell"), ["Ostra", "Pell"]);
  assert.deepEqual(splitCredit("Ostra feat. Pell"), ["Ostra", "Pell"]);
});

test("a single act with & in its name stays whole when known", () => {
  const known = (s: string) => s === "Harlow & Vine";
  assert.deepEqual(splitCredit("Harlow & Vine", known), ["Harlow & Vine"]);
  assert.deepEqual(splitCredit("Harlow & Vine, Quin", known), ["Harlow & Vine", "Quin"]);
});

test("words that only contain separators are not split", () => {
  assert.deepEqual(splitCredit("Maxwell Xavier"), ["Maxwell Xavier"]);
  assert.deepEqual(splitCredit("Withers"), ["Withers"]);
});

test("featured artists come out of the title", () => {
  const c = parseCredit("Glass Hours (feat. Pell & Quin)", "Ostra");
  assert.equal(c.title, "Glass Hours");
  assert.deepEqual(c.artists, ["Ostra", "Pell", "Quin"]);
  assert.equal(c.credit, "Ostra, Pell & Quin");
});

test("store clutter is removed, versions that sound different are kept", () => {
  assert.equal(parseCredit("Glass Hours [Mixed]", "Ostra").title, "Glass Hours");
  assert.equal(parseCredit("Glass Hours - Remastered 2011", "Ostra").title, "Glass Hours");
  assert.equal(parseCredit("Glass Hours (Pell Remix)", "Ostra").title, "Glass Hours (Pell Remix)");
  assert.equal(parseCredit("Glass Hours (Live)", "Ostra").title, "Glass Hours (Live)");
});

test("a remixer is credited as an artist, the title keeps its remix", () => {
  const c = parseCredit("No Love (Fred again.. Remix) [Mixed]", "Summer Walker & SZA");
  assert.equal(c.title, "No Love (Fred again.. Remix)");
  assert.equal(c.credit, "Summer Walker, SZA & Fred again..");
  assert.equal(parseCredit("Glass Hours (Radio Remix)", "Ostra").credit, "Ostra");
});

test("the same song in a different credit order is one song", () => {
  const a = parseCredit("Glass Hours", "Mira & Lune again..");
  const b = parseCredit("Glass Hours [Mixed]", "Lune Again.. & Mira");
  assert.equal(a.songKey, b.songKey);
});

test("an artist credited twice is counted once", () => {
  assert.deepEqual(parseCredit("Glass Hours (feat. Ostra)", "Ostra").artists, ["Ostra"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCEPT, matchScore, nameSim, splitArtists, type ItunesResult } from "./match";

const r = (trackName: string, artistName: string, collectionName?: string | null): ItunesResult => ({
  trackName,
  artistName,
  collectionName: collectionName ?? undefined,
  trackViewUrl: "https://music.apple.com/x",
});

const score = (played: [track: string, artist: string, album: string | null], result: ItunesResult) =>
  matchScore(result, played[0], splitArtists(played[1]), played[2]);

const accepts = (played: [string, string, string | null], result: ItunesResult) =>
  assert.ok(score(played, result) >= ACCEPT, `should match: ${played[0]} / ${played[1]} -> ${result.trackName} / ${result.artistName} (score ${score(played, result).toFixed(3)})`);

const rejects = (played: [string, string, string | null], result: ItunesResult) =>
  assert.ok(score(played, result) < ACCEPT, `should NOT match: ${played[0]} / ${played[1]} -> ${result.trackName} / ${result.artistName} (score ${score(played, result).toFixed(3)})`);

test("names compare as whole words, never fragments", () => {
  assert.ok(nameSim("rij", "brijesh shrestha") < 0.5);
  assert.ok(nameSim("fred again", "fred again") === 1);
  assert.ok(nameSim("Ultra Naté", "Ultra Nate") === 1);
  assert.ok(nameSim("Malachiii", "Malachii") >= 0.9);
});

test("same song, artists credited in a different order", () => {
  accepts(["Dalli", "Bhaskar, DL91 Era, Encore ABJ & RiJ", "DALLI"], r("Dalli", "DL91 Era, Bhaskar, Encore ABJ & RiJ", "DALLI - Single"));
});

test("same title by different artists is rejected (the Dalli bug)", () => {
  rejects(["Dalli", "Bhaskar, DL91 Era, Encore ABJ & RiJ", "DALLI"], r("Dalli", "Brijesh Shrestha, Beyond", "Dalli - Single"));
  rejects(["Strong", "Romy & Fred again..", "Strong - Single"], r("Strong", "One Direction", "Four"));
});

test("remix only matches that remix", () => {
  const played: [string, string, string] = ["Chemical Light (Gravagerz REMIX)", "JIMRO!", "Chemical Light (Gravagerz REMIX) - Single"];
  accepts(played, r("Chemical Light (Gravagerz Remix)", "JIMRO! & Gravagerz", "Chemical Light (Gravagerz Remix) - Single"));
  rejects(played, r("Chemical Light", "JIMRO!", "Chemical Light - Single"));
  rejects(played, r("Chemical Light (Other Guy Remix)", "JIMRO!", "Chemical Light (Remixes)"));
});

test("original never matches a remix", () => {
  rejects(["Strong", "Romy & Fred again..", "Strong - Single"], r("Strong (Extended Mix)", "Romy & Fred again..", "Strong - Single"));
});

test("titles with a non-version subtitle still match", () => {
  accepts(
    ["Delilah (pull me out of this)", "Fred again.. & Delilah Montagu", "Actual Life 3 (January 1 - September 9 2022)"],
    r("Delilah (pull me out of this)", "Fred again.. & Delilah Montagu", "Actual Life 3 (January 1 - September 9 2022)"),
  );
});

test("spelling and punctuation differences", () => {
  accepts(["leavemealone", "Fred Again.. & Baby Keem", "leavemealone - Single"], r("leavemealone", "Fred again.. & Baby Keem", "leavemealone - Single"));
  accepts(["Movin' To The Sun", "HUGEL, Imael Angel & Ultra Naté", "Twenty One"], r("Movin' To the Sun", "HUGEL, Imael Angel & Ultra Nate", "Twenty One"));
  accepts(["Stay Sexy", "HUGEL, LaBritney & Mili", "Twenty One"], r("Stay Sexy", "HUGEL, LaBritney & Mili", "Twenty One"));
});

test("partial credit still matches when the main artists agree", () => {
  accepts(["Playboy", "HUGEL & Malachiii", "Twenty One"], r("Playboy", "HUGEL", "Twenty One"));
});

test("a different song that only shares a word is rejected", () => {
  rejects(["Dalli", "Bhaskar", null], r("Dalli Dalli", "Bhaskar", null));
  rejects(["Sun", "HUGEL", null], r("Movin' To the Sun", "HUGEL", null));
});

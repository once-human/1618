/**
 * Rules for deciding whether a catalog result is the song that was played.
 * Every name here is invented: these describe how matching behaves in general,
 * not any particular song.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCEPT, matchScore, nameSim, splitArtists, type ItunesResult } from "./match";

type Played = [track: string, artist: string, album: string | null];

const result = (trackName: string, artistName: string, collectionName?: string | null): ItunesResult => ({
  trackName,
  artistName,
  collectionName: collectionName ?? undefined,
  trackViewUrl: "https://music.apple.com/x",
});

const score = ([track, artist, album]: Played, r: ItunesResult) => matchScore(r, track, splitArtists(artist), album);

const accepts = (played: Played, r: ItunesResult) =>
  assert.ok(score(played, r) >= ACCEPT, `expected a match: "${played[0]}" by ${played[1]} vs "${r.trackName}" by ${r.artistName} (${score(played, r).toFixed(2)})`);

const rejects = (played: Played, r: ItunesResult) =>
  assert.ok(score(played, r) < ACCEPT, `expected no match: "${played[0]}" by ${played[1]} vs "${r.trackName}" by ${r.artistName} (${score(played, r).toFixed(2)})`);

test("names are compared as whole words, never as fragments", () => {
  assert.ok(nameSim("ana", "banana") < 0.5);
  assert.ok(nameSim("aj", "ajr") < 0.5);
  assert.equal(nameSim("The Night Owls", "the night owls"), 1);
});

test("accents, case and punctuation don't matter", () => {
  assert.equal(nameSim("Zoë Marín", "Zoe Marin"), 1);
  assert.equal(nameSim("Mr. Bright..", "mr bright"), 1);
  accepts(["Don't Stop Now", "Zoë Marín", null], result("Dont Stop Now", "Zoe Marin"));
});

test("small spelling differences in a name are tolerated", () => {
  assert.ok(nameSim("Kalliope", "Kaliope") >= 0.9);
});

test("the same credits in a different order still match", () => {
  accepts(["Paper Boats", "Ana Lis, Dev Kade & Mirro", "Paper Boats"], result("Paper Boats", "Mirro, Ana Lis & Dev Kade", "Paper Boats - Single"));
});

test("a catalog crediting only the main artist still matches", () => {
  accepts(["Night Drive", "Ana Lis & Dev Kade", "Long Roads"], result("Night Drive", "Ana Lis", "Long Roads"));
  accepts(["Night Drive", "Ana Lis feat. Dev Kade", null], result("Night Drive", "Ana Lis"));
});

test("the same title by a different artist is rejected", () => {
  rejects(["Paper Boats", "Ana Lis, Dev Kade & Mirro", "Paper Boats"], result("Paper Boats", "Someone Else, Another Person", "Paper Boats - Single"));
  rejects(["Night Drive", "Ana Lis", null], result("Night Drive", "Analise"));
});

test("an artist name hidden inside another artist's name is not a match", () => {
  rejects(["Glow", "Ken", null], result("Glow", "Kendra Moss"));
});

test("a remix only matches that same remix", () => {
  const played: Played = ["Glass Hearts (Ray Vale Remix)", "Mirro", "Glass Hearts (Ray Vale Remix) - Single"];
  accepts(played, result("Glass Hearts (Ray Vale REMIX)", "Mirro & Ray Vale", "Glass Hearts (Ray Vale Remix) - Single"));
  rejects(played, result("Glass Hearts", "Mirro", "Glass Hearts - Single"));
  rejects(played, result("Glass Hearts (Other Person Remix)", "Mirro", "Glass Hearts (Remixes)"));
});

test("an original never matches a remix, live or sped-up version", () => {
  const played: Played = ["Glass Hearts", "Mirro", "Glass Hearts - Single"];
  rejects(played, result("Glass Hearts (Extended Mix)", "Mirro"));
  rejects(played, result("Glass Hearts (Live)", "Mirro"));
  rejects(played, result("Glass Hearts (Sped Up)", "Mirro"));
});

test("a subtitle that isn't a version still matches", () => {
  accepts(["Harbour (stay a while)", "Dev Kade", "Seasons"], result("Harbour (stay a while)", "Dev Kade", "Seasons"));
});

test("a different song that only shares a word is rejected", () => {
  rejects(["Rain", "Mirro", null], result("Rain Rain", "Mirro"));
  rejects(["Sun", "Ana Lis", null], result("Walking To The Sun", "Ana Lis"));
});

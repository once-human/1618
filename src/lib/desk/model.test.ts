import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSpans, cleanSample, doing, live, playing, rollup, type Sample } from "./model";

const at = (min: number) => new Date(Date.UTC(2026, 9, 26, 10, min)).toISOString();
const s = (min: number, over: Record<string, unknown> = {}): Sample =>
  cleanSample({ t: at(min), active: true, idleS: 0, app: { id: "kitty", name: "Kitty", category: "terminal" }, ...over })!;

test("a sample is cleaned: titles of YouTube never pass, adult sites become private", () => {
  const yt = cleanSample({ t: at(0), active: true, site: { host: "www.youtube.com", name: "YouTube", category: "video" }, media: { player: "firefox", state: "playing", source: "youtube", title: "Secret video", artist: "Someone", videos: 3 } })!;
  assert.equal(yt.media?.title, null);
  assert.equal(yt.media?.artist, null);
  assert.equal(yt.media?.videos, 3);
  assert.equal(yt.site?.host, "youtube.com");
  const bad = cleanSample({ t: at(0), active: true, site: { host: "xvideos.com", name: "x", category: "video" } })!;
  assert.equal(bad.site?.category, "private");
  assert.equal(bad.site?.host, "");
  assert.equal(cleanSample({ nope: 1 }), null);
});

test("what I'm doing: Claude first, then code, then the site", () => {
  assert.equal(doing(s(0, { claude: true, repo: "1618" })).label, "Working with Claude Code");
  assert.equal(doing(s(0, { app: { id: "nvim", name: "Neovim", category: "editor" }, repo: "1618" })).kind, "coding");
  assert.equal(doing(s(0, { app: { id: "firefox", name: "Firefox", category: "browser" }, site: { host: "monkeytype.com", name: "Monkeytype", category: "other" } })).label, "On Monkeytype");
  assert.equal(doing(s(0, { app: { id: "firefox", name: "Firefox", category: "browser" }, site: { host: "youtube.com", name: "YouTube", category: "video" } })).label, "Watching YouTube");
  assert.equal(doing(s(0, { active: false })).kind, "idle");
});

test("a track is named, a YouTube video is not", () => {
  assert.equal(playing(s(0, { media: { player: "spotify", state: "playing", source: "spotify", title: "Glass Hours", artist: "Ostra" } }))?.label, "Glass Hours");
  assert.equal(playing(s(0, { media: { player: "firefox", state: "playing", source: "youtube", title: "x", videos: 1 } }))?.detail, "1 video so far");
  assert.equal(playing(s(0, { media: { player: "spotify", state: "paused", source: "spotify", title: "A" } })), null);
});

test("samples fold into spans and a gap breaks them", () => {
  const spans = buildSpans([s(0), s(1), s(2), s(10), s(11)]);
  const laptop = spans.filter((x) => x.lane === "laptop");
  assert.equal(laptop.length, 2);
  assert.equal(laptop[0].start, at(0));
  assert.equal(laptop[0].end, at(3));
});

test("a day rolls up to minutes, repos and tracks", () => {
  const samples = [0, 1, 2, 3].map((m) => s(m, { claude: true, repo: "1618", media: { player: "spotify", state: "playing", source: "spotify", title: "Glass Hours", artist: "Ostra" } }));
  const r = rollup(buildSpans(samples));
  assert.equal(r.activeMin, 4);
  assert.equal(r.claudeMin, 4);
  assert.equal(r.repos[0].name, "1618");
  assert.equal(r.tracks[0].label, "Glass Hours");
});

test("online means a sample in the last four minutes", () => {
  assert.equal(live(s(0), Date.parse(at(3))).online, true);
  assert.equal(live(s(0), Date.parse(at(6))).online, false);
  assert.equal(live(null, 0).lastSeen, null);
});

test("between batched uploads the laptop is still there until the next one is due", () => {
  const expect = new Date(Date.parse(at(0)) + 17 * 60_000).toISOString();
  assert.equal(live(s(0), Date.parse(at(10)), null, null, expect).online, true);
  assert.equal(live(s(0), Date.parse(at(18)), null, null, expect).online, false);
  // A final upload clears the expectation, so a closed lid shows as away after the usual four minutes.
  assert.equal(live(s(0), Date.parse(at(10)), null, null, null).online, false);
});

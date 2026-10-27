import assert from "node:assert/strict";
import { test } from "node:test";
import { think } from "./brain";
import type { Live } from "@/lib/desk/model";

const NOW = Date.parse("2026-10-27T10:00:00Z");
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString();
const desk = (recent: Partial<NonNullable<Live["recent"]>>, active = true): Live => ({
  online: true, lastSeen: ago(0), active, lastActive: ago(0), doing: null, doingSince: null, playing: null,
  recent: { focus: [], work: null, claudeAt: null, call: null, chat: null, media: null, battery: null, sys: null, ...recent },
});
const base = { now: NOW, seed: "s", desk: null, music: null, push: null, pin: null, phoneAt: null };
const song = { track: "Destruct", artist: "Fred again..", nowPlaying: true, at: ago(1) };

test("YouTube playing wins over the browser being focused", () => {
  const out = think({ ...base, desk: desk({ focus: [{ name: "Chrome", category: "browser", share: 1 }], media: { source: "youtube", title: null, artist: null, videos: 6, since: ago(75), browser: "Chrome" } }) });
  assert.match(out!.text, /YouTube/);
  assert.doesNotMatch(out!.text, /Chrome/);
});
test("a short YouTube stretch stays private", () => {
  const out = think({ ...base, desk: desk({ media: { source: "youtube", title: null, artist: null, videos: 2, since: ago(10), browser: "Chrome" } }) });
  assert.doesNotMatch(out?.text ?? "", /YouTube/);
});
test("a song that just ended is still the last thing I played", () => {
  const out = think({ ...base, music: { track: "Destruct", artist: "Fred again..", nowPlaying: false, at: ago(5) }, desk: desk({}, false) });
  assert.match(out!.text, /Just played %%Destruct%% by Fred again\.\./);
  assert.equal(think({ ...base, music: { track: "Destruct", artist: "Fred again..", nowPlaying: false, at: ago(12) }, desk: desk({}, false) }), null);
});
test("music from the phone comes before what the laptop's focused on", () => {
  const out = think({ ...base, music: song, desk: desk({ focus: [{ name: "Chrome", category: "browser", share: 1 }] }) });
  assert.match(out!.text, /Destruct/);
  assert.deepEqual(out!.devices.sort(), ["laptop", "phone"]);
});
test("Claude app plus a recent push is building that repo, with the music", () => {
  const out = think({ ...base, music: song, push: { repo: "1618", at: ago(30) }, desk: desk({ work: { repo: null, via: "ai", app: "Claude Code", at: ago(1), since: ago(40) }, focus: [{ name: "WhatsApp", category: "chat", share: 0.6 }] }) });
  assert.match(out!.text, /1618/);
  assert.match(out!.text, /Claude Code/);
  assert.match(out!.text, /%%Destruct%%/);
  assert.match(out!.text, /@@1618@@/);
  assert.equal(out!.note, "pushed 30m ago");
});
test("a push alone is shipping", () => {
  assert.match(think({ ...base, push: { repo: "1618", at: ago(3) } })!.text, /1618/);
});
test("pins mean the phone is out", () => {
  const out = think({ ...base, pin: { at: ago(2), board: "Moodboard" }, desk: desk({}, false) });
  assert.match(out!.text, /Moodboard|Pinterest|phone|pins/i);
  assert.deepEqual(out!.devices, ["phone"]);
});
test("chat apps read as texting; flicking between two reads as bouncing", () => {
  assert.match(think({ ...base, desk: desk({ focus: [{ name: "Telegram", category: "chat", share: 0.9 }] }) })!.text, /Telegram/);
  assert.match(think({ ...base, desk: desk({ focus: [{ name: "Telegram", category: "chat", share: 0.5 }, { name: "Claude", category: "ai", share: 0.45 }] }) })!.text, /between|Juggling/);
});
test("nothing going on is null", () => {
  assert.equal(think({ ...base, desk: desk({}, false) }), null);
});

test("a call beats everything", () => {
  const out = think({ ...base, music: song, desk: desk({ call: { label: "On a call on Google Meet", since: ago(20), sure: true } }) });
  assert.match(out!.text, /^On a call on Google Meet\.$/);
  assert.equal(out!.note, "20 minutes in");
});
test("a short stretch of mic is only probably a call", () => {
  const out = think({ ...base, desk: desk({ call: { label: "On a call on Google Meet", since: ago(3), sure: false } }) });
  assert.match(out!.text, /^Probably on a call on Google Meet\.$/);
});
test("other video is Netflix", () => {
  assert.match(think({ ...base, desk: desk({ media: { source: "browser", title: null, artist: null, videos: null, since: ago(5), browser: "Chrome" } }) })!.text, /Netflix/);
});
test("a push with Claude open in the last five minutes is with Claude Code", () => {
  const out = think({ ...base, push: { repo: "1618", at: ago(4) }, desk: desk({ claudeAt: ago(3) }) });
  assert.match(out!.text, /Working on @@1618@@ with \*\*Claude Code\*\*/);
  assert.equal(out!.note, "pushed 4m ago");
  assert.doesNotMatch(think({ ...base, push: { repo: "1618", at: ago(4) } })!.text, /Claude/);
});

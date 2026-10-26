import assert from "node:assert/strict";
import { test } from "node:test";
import { think } from "./brain";
import type { Live } from "@/lib/desk/model";

const NOW = Date.parse("2026-10-27T10:00:00Z");
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString();
const desk = (recent: Partial<NonNullable<Live["recent"]>>, active = true): Live => ({
  online: true, lastSeen: ago(0), active, lastActive: ago(0), doing: null, doingSince: null, playing: null,
  recent: { focus: [], work: null, media: null, battery: null, sys: null, ...recent },
});
const base = { now: NOW, seed: "s", desk: null, music: null, push: null, pin: null, phoneAt: null };
const song = { track: "Destruct", artist: "Fred again..", nowPlaying: true, at: ago(1) };

test("YouTube playing wins over the browser being focused", () => {
  const out = think({ ...base, desk: desk({ focus: [{ name: "Chrome", category: "browser", share: 1 }], media: { source: "youtube", title: null, artist: null, videos: 6, since: ago(10), browser: "Chrome" } }) });
  assert.match(out!.text, /YouTube/);
  assert.match(out!.text, /6/);
});
test("music from the phone comes before what the laptop's focused on", () => {
  const out = think({ ...base, music: song, desk: desk({ focus: [{ name: "Chrome", category: "browser", share: 1 }] }) });
  assert.match(out!.text, /Destruct/);
  assert.deepEqual(out!.devices.sort(), ["laptop", "phone"]);
});
test("Claude app plus a recent push is building that repo, with the music", () => {
  const out = think({ ...base, music: song, push: { repo: "1618", at: ago(30) }, desk: desk({ work: { repo: null, via: "ai", at: ago(1), since: ago(40) }, focus: [{ name: "WhatsApp", category: "chat", share: 0.6 }] }) });
  assert.match(out!.text, /1618/);
  assert.match(out!.text, /Claude/);
  assert.match(out!.text, /Destruct/);
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
  assert.match(think({ ...base, desk: desk({ focus: [{ name: "Telegram", category: "chat", share: 0.5 }, { name: "Claude", category: "ai", share: 0.45 }] }) })!.text, /between/);
});
test("nothing going on is null", () => {
  assert.equal(think({ ...base, desk: desk({}, false) }), null);
});

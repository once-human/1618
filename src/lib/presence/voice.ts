/**
 * The words of Signals: what the line at the top says, in my voice. Every
 * situation has a few ways of saying it; one is picked by a seed made of the
 * situation and a 25-minute bucket of time, so the line changes as time goes
 * on but never flickers between refreshes. **double stars** mark the bold bits.
 * Pure strings, tested in voice.test.ts.
 */
import type { Doing } from "@/lib/desk/model";

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const pick = <T,>(xs: readonly T[], seed: string): T => xs[hash(seed) % xs.length];

/** "a few minutes", "20 minutes", "an hour", "2 hours", "3½ hours". */
export function dur(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 5) return "a few minutes";
  if (m < 55) return `${Math.round(m / 5) * 5} minutes`;
  if (m < 85) return "an hour";
  const h = Math.round((m / 60) * 2) / 2;
  return `${Math.floor(h)}${h % 1 ? "½" : ""} hours`;
}

const fill = (s: string, v: Record<string, string | null | undefined>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

/** What I'm doing on the laptop, as a sentence. `forMs` is how long I've been on it. */
export function doingLine(d: Doing, forMs: number, seed: string): string {
  const v = { repo: d.detail, site: d.label.replace(/^(On|In|Watching) /, ""), dur: dur(forMs) };
  const long = forMs >= 90 * 60_000;
  const say = (xs: string[]) => fill(pick(xs, `${seed}|${d.kind}|${long}`), v);
  switch (d.kind) {
    case "claude":
      if (!d.detail) return say(["Working with **Claude Code**.", "Building something with **Claude Code**."]);
      return long
        ? say(["**{dur}** into **{repo}** with Claude Code. Not stopping yet.", "Heads-down on **{repo}** for {dur}, Claude Code on the keys.", "Still on **{repo}** with Claude Code. {dur} and counting."])
        : say(["Building **{repo}** with Claude Code.", "Deep in **{repo}**, Claude Code doing the typing.", "Pair-programming with Claude on **{repo}**.", "Shipping bits of **{repo}** with Claude Code."]);
    case "coding":
      if (d.detail?.includes(".")) return say(["On **{site}**.", "Reading code on **{site}**."]);
      if (!d.detail) return say(["Writing code.", "In the code."]);
      return long ? say(["{dur} in the **{repo}** code.", "Still in **{repo}**, {dur} now."]) : say(["Writing code in **{repo}**.", "In the **{repo}** code.", "Hands on **{repo}**."]);
    case "terminal":
      return d.detail ? say(["In the terminal, **{repo}**.", "Somewhere in a terminal in **{repo}**."]) : say(["In the terminal.", "Living in the terminal."]);
    case "watching":
      if (d.label === "Watching YouTube")
        return long ? say(["{dur} of **YouTube**. Send help.", "Deep in a **YouTube** hole, {dur} in."]) : say(["Watching **something on YouTube**.", "On **YouTube**. Don't ask what.", "**YouTube** break."]);
      return say(["Watching **{site}**.", "On **{site}**, watching something."]);
    case "chat":
      return say(["Talking to people on **{site}**.", "Replying on **{site}**.", "On **{site}**."]);
    case "writing":
      return d.label === "In email" ? say(["Doing **email**. Inbox mode.", "In my **inbox**.", "Answering **email**."]) : say(["Writing in **{site}**.", "In **{site}**, writing things down."]);
    case "design":
      return say(["Designing in **{site}**.", "Pushing pixels in **{site}**."]);
    case "music":
      return say(["Digging for music on **{site}**.", "On **{site}**, finding songs."]);
    case "browsing":
      if (d.label === "Browsing") return say(["Browsing.", "Wandering the internet."]);
      return long ? say(["{dur} on **{site}**.", "Still on **{site}**."]) : say(["On **{site}**.", "Poking around **{site}**."]);
    case "idle":
      return say(["At the laptop, not touching it.", "Laptop's open, I'm not."]);
    default:
      return say(["In **{site}**.", "Using **{site}**."]);
  }
}

/** A song, as a tail to whatever else is going on, or as the whole line. */
export function musicLine(track: string, artist: string, seed: string, alone: boolean): string {
  const v = { track, artist };
  return fill(
    pick(
      alone
        ? ["Listening to **{track}** by {artist}.", "Headphones on: **{track}** by {artist}.", "Up, playing **{track}** by {artist}.", "**{track}** by {artist}, playing right now."]
        : ["Listening to **{track}** by {artist}.", "**{track}** by {artist} on.", "Soundtrack: **{track}** by {artist}."],
      `${seed}|music|${alone}`,
    ),
    v,
  );
}

export function bedLine(clock: string, seed: string): string {
  return fill(pick(["Went to bed at **{clock}**.", "Gone to bed, **{clock}**.", "Off to sleep at **{clock}**.", "Said good night at **{clock}**."], `${seed}|bed`), { clock });
}

/** Quiet states. `clock` is when it went quiet, `forMs` how long ago. */
export function quietLine(state: "probably" | "asleep" | "crashed" | "out", clock: string, forMs: number, seed: string): string {
  const v = { clock, dur: dur(forMs) };
  const s = `${seed}|${state}`;
  switch (state) {
    case "probably":
      return fill(pick(["Probably asleep. Went quiet at **{clock}**.", "Quiet since **{clock}**. Probably out cold.", "Likely asleep, nothing since **{clock}**."], s), v);
    case "asleep":
      return fill(pick(["Asleep since about **{clock}**.", "Out cold since **{clock}**.", "Sleeping. Last sign of life at **{clock}**.", "Asleep. Went quiet at **{clock}**, {dur} ago."], s), v);
    case "crashed":
      return fill(pick(["Crashed, probably. No sleep last night, quiet since **{clock}**.", "Finally asleep, I'd guess. Quiet since **{clock}** after a night without any.", "The all-nighter caught up. Quiet since **{clock}**."], s), v);
    case "out":
      return forMs < 2 * 3600_000
        ? fill(pick(["Stepped away. Back soon, probably.", "Away from the screen for {dur}.", "Away for a bit. Quiet since **{clock}**."], s), v)
        : fill(pick(["Out somewhere. Quiet since **{clock}**.", "Probably outside. Nothing since **{clock}**.", "Off the grid since **{clock}**.", "Away from the screens, {dur} now. Out living, hopefully."], s), v);
  }
}

export function lateLine(clock: string, seed: string): string {
  return fill(pick(["Still up at **{clock}**.", "**{clock}** and still going.", "It's **{clock}**. Not asleep yet."], `${seed}|late`), { clock });
}

export function allnighterLine(clock: string, seed: string): string {
  return fill(pick(["Pulled an **all-nighter**. Still going.", "No sleep tonight. It's **{clock}** and I'm still at it.", "**All-nighter.** The sun's up, I'm still here.", "Haven't slept. **{clock}**, still awake."], `${seed}|allnighter`), { clock });
}

export function wokeLine(clock: string, hours: number, seed: string): string {
  const v = { clock, h: String(hours) };
  if (hours < 5) return fill(pick(["Up since {clock}. Only {h}h of sleep.", "Short night: {h}h, up since {clock}."], `${seed}|woke-short`), v);
  if (hours >= 9) return fill(pick(["{h}h of sleep, up since {clock}. Slept like a rock.", "Up since {clock} after a long {h}h."], `${seed}|woke-long`), v);
  return fill(pick(["Up since {clock}, after about {h}h of sleep.", "Woke up around {clock}. About {h}h of sleep.", "Morning. Up since {clock}, {h}h of sleep."], `${seed}|woke`), v);
}

export const noSleepTail = (seed: string) => pick([" Running on no sleep.", " Haven't slept.", " Zero sleep, still going."], `${seed}|nosleep`);

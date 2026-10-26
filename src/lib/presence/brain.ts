/**
 * The brain behind Signals (the live line at the top of the site): every
 * signal from my phone and my laptop, folded into one sentence about what I'm
 * doing right now. No AI, just an order of importance and some judgement:
 *
 *   1. My phone: what's playing (Last.fm), pins I'm saving, the phone being
 *      picked up (the Health shortcut runs when I open apps).
 *   2. Code: a push, Claude Code, an editor or terminal in a repo, or the
 *      Claude app with a recent push. It sticks for 15 minutes, so a detour to
 *      WhatsApp doesn't end "building 1618".
 *   3. What's playing on the laptop (YouTube, a video in the browser).
 *   4. The app I've mostly had in front of me in the last five minutes, by
 *      time (flicking through workspaces doesn't count).
 *
 * Two or three at once become one sentence: "Building 1618 with Claude,
 * listening to Destruct by Fred again..". **Double stars** mark bold bits.
 */
import type { Live as DeskLive } from "@/lib/desk/model";
import { dur, pick } from "./voice";

export interface BrainInput {
  now: number;
  /** A seed that changes every 25 minutes or so, so lines rotate without flickering. */
  seed: string;
  desk: DeskLive | null;
  /** The newest track from Last.fm. */
  music: { track: string; artist: string; nowPlaying: boolean; at: string } | null;
  /** The newest push. */
  push: { repo: string; at: string } | null;
  /** The newest pin I saved. */
  pin: { at: string; board: string | null } | null;
  /** The phone being picked up: the Health shortcut runs when I open certain apps. */
  phoneAt: string | null;
}

export interface BrainOut {
  text: string;
  /** Which devices the sentence is drawn from. */
  devices: ("phone" | "laptop")[];
}

const MIN = 60_000;
const ago = (iso: string, now: number) => now - Date.parse(iso);
const say = (xs: string[], seed: string, v: Record<string, unknown> = {}) =>
  pick(xs, seed).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export function think(i: BrainInput): BrainOut | null {
  const { now, seed, desk } = i;
  const online = !!desk?.online;
  const active = online && !!desk?.active;
  const r = online ? (desk?.recent ?? null) : null;

  // ---- what each signal says ----
  const song = i.music?.nowPlaying ? i.music : null;
  const laptopSong = r?.media?.source === "music" ? r.media : null;
  const songOnLaptop = !!(song && laptopSong?.title && laptopSong.title.toLowerCase().includes(song.track.toLowerCase().slice(0, 12)));
  const music = song ?? (laptopSong?.title ? { track: laptopSong.title, artist: laptopSong.artist ?? "", nowPlaying: true, at: laptopSong.since } : null);
  const musicOnPhone = !!song && !songOnLaptop;

  const pinning = i.pin && ago(i.pin.at, now) < 10 * MIN ? i.pin : null;
  const phoneUp = !!pinning || (!!i.phoneAt && ago(i.phoneAt, now) < 5 * MIN);

  const freshPush = i.push && ago(i.push.at, now) < 20 * MIN ? i.push : null;
  const work = r?.work && ago(r.work.at, now) < 15 * MIN ? r.work : null;
  const repo = work?.repo ?? (i.push && ago(i.push.at, now) < 90 * MIN ? i.push.repo : null);
  const coding = !!work || !!freshPush;
  const justPushed = !!(i.push && repo && i.push.repo === repo && ago(i.push.at, now) < 6 * MIN);

  const video = active && r?.media && r.media.source !== "music" ? r.media : null;
  const focus = active ? (r?.focus ?? []) : [];

  const devices = new Set<"phone" | "laptop">();
  const parts: string[] = [];

  // ---- 1 & 2: code, with whatever plays alongside ----
  if (coding) {
    devices.add("laptop");
    const forMs = work ? now - Date.parse(work.since) : 0;
    const via = work?.via ?? "push";
    const s = `${seed}|code|${via}|${repo}`;
    let main: string;
    if ((via === "claude" || via === "ai") && repo)
      main = forMs >= 90 * MIN
        ? say(["**{dur}** into **{repo}** with Claude", "Still deep in **{repo}** with Claude, {dur} in"], s, { repo, dur: dur(forMs) })
        : say(["Building **{repo}** with Claude", "Deep in **{repo}** with Claude", "Shipping bits of **{repo}** with Claude", "Pair-programming with Claude on **{repo}**"], s, { repo });
    else if (via === "claude" || via === "ai") main = say(["Building something with **Claude**", "Working something out with **Claude**"], s);
    else if (via === "editor") main = repo ? say(["Writing code in **{repo}**", "Hands-on in the **{repo}** code"], s, { repo }) : "Writing code";
    else if (via === "terminal") main = say(["In the terminal on **{repo}**", "Somewhere in a terminal in **{repo}**"], s, { repo });
    else main = say(["Shipping **{repo}**", "Pushing **{repo}** forward"], s, { repo: freshPush!.repo });
    parts.push(main);
    if (music) {
      if (musicOnPhone) devices.add("phone");
      parts.push(say([", listening to **{track}** by {artist}", ", **{track}** by {artist} playing", " to **{track}** by {artist}"], `${s}|m`, music));
    } else if (video) parts.push(say([", YouTube on the side", ", with a video playing in the background"], `${s}|v`));
    let text = parts.join("") + ".";
    if (pinning) {
      devices.add("phone");
      text += say([" Saving pins to **{board}** on my phone in between.", " Phone out too, saving pins."], `${s}|p`, { board: pinning.board ?? "a board" });
    }
    if (justPushed && via !== "push") text += say([" Just pushed.", " Pushed a minute ago."], `${s}|jp`);
    return { text, devices: [...devices] };
  }

  // ---- 1: music (the phone first) ----
  if (music) {
    devices.add(musicOnPhone ? "phone" : "laptop");
    const s = `${seed}|music|${music.track}`;
    let text = say(["Listening to **{track}** by {artist}", "Headphones on: **{track}** by {artist}", "**{track}** by {artist}, playing right now"], s, music);
    if (musicOnPhone && !active && !pinning) text += say([" on my phone", ""], `${s}|ph`);
    if (pinning) {
      devices.add("phone");
      text += say([", saving pins to **{board}**", ", scrolling Pinterest"], `${s}|p`, { board: pinning.board ?? "a board" });
    } else if (active && !video) {
      const c = focusClause(focus, `${s}|f`);
      if (c) {
        devices.add("laptop");
        text += `, ${c}`;
      }
    }
    return { text: text + ".", devices: [...devices] };
  }

  // ---- 3: something playing on the laptop ----
  if (video) {
    devices.add("laptop");
    const s = `${seed}|video|${video.source}`;
    const forMs = now - Date.parse(video.since);
    let text =
      video.source === "youtube"
        ? forMs >= 45 * MIN
          ? say(["**{dur}** of YouTube and counting", "Deep in a **YouTube** hole, {dur} in"], s, { dur: dur(forMs) })
          : say(["Watching **something on YouTube**", "On **YouTube**, don't ask what", "**YouTube** break"], s)
        : say(["Watching something in **{b}**", "A video's playing in **{b}**"], s, { b: video.browser ?? "the browser" });
    if (video.source === "youtube" && (video.videos ?? 0) >= 3) text += say([" ({n} videos deep)", ", video number {n}"], `${s}|n`, { n: video.videos });
    if (phoneUp) {
      devices.add("phone");
      text += say([", phone in hand too", ", half on my phone"], `${s}|ph`);
    }
    return { text: text + ".", devices: [...devices] };
  }

  // ---- 1: the phone on its own ----
  if (phoneUp) {
    devices.add("phone");
    const s = `${seed}|phone`;
    let text = pinning
      ? say(["On my phone, saving pins to **{board}**.", "Saving pins to **{board}**.", "Collecting things on Pinterest, **{board}** this time."], s, { board: pinning.board ?? "a board" })
      : say(["On my phone.", "Phone in hand.", "Scrolling something on my phone."], s);
    if (online && !active) text += say([" Laptop's open, I'm not at it.", ""], `${s}|l`);
    else if (active) {
      const c = focusClause(focus, `${s}|f`);
      if (c) {
        devices.add("laptop");
        text += ` Also on the laptop, ${c}.`;
      }
    }
    return { text, devices: [...devices] };
  }

  // ---- 4: just the laptop, by what's mostly been in front of me ----
  if (active && focus.length) {
    devices.add("laptop");
    const c = focusClause(focus, `${seed}|solo`);
    if (c) return { text: c.charAt(0).toUpperCase() + c.slice(1) + ".", devices: [...devices] };
  }
  return null;
}

/** "probably texting someone on WhatsApp", "bouncing between Telegram and Chrome"… or null when there's nothing worth saying. */
export function focusClause(focus: { name: string; category: string; share: number }[], seed: string): string | null {
  const [a, b] = focus;
  if (!a) return null;
  if (b && a.share < 0.55 && b.share >= 0.25 && a.category !== b.category) return say(["bouncing between **{a}** and **{b}**", "flicking between **{a}** and **{b}**"], seed, { a: a.name, b: b.name });
  const v = { name: a.name };
  switch (a.category) {
    case "chat":
      return say(["probably texting someone on **{name}**", "replying to people on **{name}**", "catching up on **{name}**"], seed, v);
    case "ai":
      return say(["talking things through with **{name}**", "thinking out loud with **{name}**"], seed, v);
    case "browser":
      return say(["somewhere on the internet", "wandering around in **{name}**"], seed, v);
    case "files":
      return say(["digging through files", "sorting through folders"], seed);
    case "tool":
      return say(["fiddling with settings", "tweaking something on the laptop"], seed);
    case "notes":
      return say(["writing notes in **{name}**", "jotting things down in **{name}**"], seed, v);
    case "design":
      return say(["designing in **{name}**", "pushing pixels in **{name}**"], seed, v);
    case "editor":
    case "ide":
      return say(["in the code", "writing code"], seed);
    case "terminal":
      return say(["in the terminal", "living in the terminal"], seed);
    case "media":
      return say(["in **{name}**"], seed, v);
    default:
      return say(["in **{name}**", "using **{name}**"], seed, v);
  }
}

/** The laptop, in one short line for under the sentence: battery, and how busy it is. */
export function laptopLine(desk: DeskLive | null): string | null {
  const r = desk?.online ? desk.recent : null;
  if (!r) return null;
  const bits: string[] = [];
  if (r.battery) bits.push(`Laptop at ${r.battery.pct}%${r.battery.charging ? (r.battery.pct >= 100 ? ", plugged in" : ", charging") : ""}`);
  if (r.sys) bits.push(`CPU ${Math.round(r.sys.cpu)}%, ${r.sys.memGB} of ${r.sys.totalGB} GB RAM in use`);
  return bits.length ? bits.join(". ") + "." : null;
}

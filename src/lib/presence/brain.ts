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
    const R = repo ? `@@${repo}@@` : "";
    let main: string;
    if ((via === "claude" || via === "ai") && repo)
      main = forMs >= 90 * MIN
        ? say(["Working on {R} with Claude, {dur} in", "{dur} into {R} with Claude"], s, { R, dur: dur(forMs) })
        : say(["Working on {R} with Claude", "Writing code in {R} with Claude", "Building {R} with Claude"], s, { R });
    else if (via === "claude" || via === "ai") main = say(["Working with **Claude**", "In **Claude**, working something out"], s);
    else if (via === "editor") main = repo ? say(["Writing code in {R}", "Working on {R}"], s, { R }) : "Writing code";
    else if (via === "terminal") main = say(["In the terminal, working on {R}", "In the terminal in {R}"], s, { R });
    else main = say(["Just pushed to {R}", "Pushed to {R} a few minutes ago"], s, { R: `@@${freshPush!.repo}@@` });
    parts.push(main);
    if (music) {
      if (musicOnPhone) devices.add("phone");
      parts.push(say([", listening to **{track}** by {artist}", ", with **{track}** by {artist} on", ", playing **{track}** by {artist}"], `${s}|m`, music));
    } else if (video) parts.push(`, ${videoWhere(video)}`);
    let text = parts.join("") + ".";
    if (pinning) {
      devices.add("phone");
      text += say([" Also saving pins to **{board}** on my phone.", " Phone's out too, saving pins to **{board}**."], `${s}|p`, { board: pinning.board ?? "a board" });
    }
    if (justPushed && via !== "push") text += " Just pushed.";
    return { text, devices: [...devices] };
  }

  // ---- 1: music (the phone first) ----
  if (music) {
    devices.add(musicOnPhone ? "phone" : "laptop");
    const s = `${seed}|music|${music.track}`;
    let text = say(["Listening to **{track}** by {artist}", "Playing **{track}** by {artist}", "**{track}** by {artist} is on"], s, music);
    if (musicOnPhone && !active && !pinning) text += " on my phone";
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
    let text = videoWhere(video);
    text = text.charAt(0).toUpperCase() + text.slice(1);
    if (video.source === "youtube" && forMs >= 30 * MIN) text += `. ${dur(forMs)} in${(video.videos ?? 0) >= 2 ? `, ${video.videos} videos` : ""}`;
    else if (video.source === "youtube" && (video.videos ?? 0) >= 2) text += `, video number ${video.videos}`;
    if (phoneUp) {
      devices.add("phone");
      text += ". Phone's in hand too";
    }
    void s;
    return { text: text + ".", devices: [...devices] };
  }

  // ---- 1: the phone on its own ----
  if (phoneUp) {
    devices.add("phone");
    const s = `${seed}|phone`;
    let text = pinning
      ? say(["Active on my phone, saving pins to **{board}**.", "Saving pins to **{board}** on my phone."], s, { board: pinning.board ?? "a board" })
      : say(["Active on my phone.", "On my phone."], s);
    if (active) {
      const c = focusClause(focus, `${s}|f`);
      if (c) {
        devices.add("laptop");
        text += ` The laptop's open too, ${c}.`;
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

/** "watching a YouTube video in Chrome": what, and where, never which video. */
function videoWhere(v: { source: string; browser: string | null }): string {
  const where = v.browser ? ` in ${v.browser}` : "";
  return v.source === "youtube" ? `watching a **YouTube** video${where}` : `watching a video${where}`;
}

/** "probably texting someone on WhatsApp", "bouncing between Telegram and Chrome"… or null when there's nothing worth saying. */
export function focusClause(focus: { name: string; category: string; share: number }[], seed: string): string | null {
  const [a, b] = focus;
  if (!a) return null;
  if (b && a.share < 0.55 && b.share >= 0.25 && a.category !== b.category) return say(["switching between **{a}** and **{b}**", "going back and forth between **{a}** and **{b}**"], seed, { a: a.name, b: b.name });
  const v = { name: a.name };
  switch (a.category) {
    case "chat":
      return say(["probably texting someone on **{name}**", "probably replying to someone on **{name}**", "catching up on **{name}**"], seed, v);
    case "ai":
      return say(["talking something through with **{name}**", "working something out in **{name}**"], seed, v);
    case "browser":
      return say(["browsing in **{name}**", "on the web in **{name}**"], seed, v);
    case "files":
      return "in the file manager";
    case "tool":
      return "in settings";
    case "notes":
      return say(["writing in **{name}**", "taking notes in **{name}**"], seed, v);
    case "design":
      return say(["designing in **{name}**", "working in **{name}**"], seed, v);
    case "editor":
    case "ide":
      return "writing code";
    case "terminal":
      return "in the terminal";
    default:
      return say(["in **{name}**", "using **{name}**"], seed, v);
  }
}

/** The laptop, in one short line for under the sentence: battery, and how busy it is. Only while I'm actually at it. */
export function laptopLine(desk: DeskLive | null): string | null {
  const r = desk?.online && desk.active ? desk.recent : null;
  if (!r) return null;
  const bits: string[] = [];
  if (r.battery) bits.push(`Laptop at ${r.battery.pct}%${r.battery.charging ? (r.battery.pct >= 100 ? ", plugged in" : ", charging") : ""}`);
  if (r.sys) {
    // Memory as one pool: RAM plus swap (zram included).
    const used = Math.round((r.sys.memGB + (r.sys.swapGB ?? 0)) * 10) / 10;
    const total = Math.round((r.sys.totalGB + (r.sys.swapTotalGB ?? 0)) * 10) / 10;
    bits.push(`CPU ${Math.round(r.sys.cpu)}%, ${used} of ${total} GB memory in use`);
  }
  return bits.length ? bits.join(". ") + "." : null;
}

/** When I'm not at the laptop but my phone's doing something: say so instead of the laptop's numbers. */
export function phoneLine(i: BrainInput, text: string): string | null {
  const online = !!i.desk?.online;
  if (online && i.desk?.active) return null;
  if (/phone|Pinterest/i.test(text)) return null;
  const phone = !!i.music?.nowPlaying || (!!i.pin && Date.now() - Date.parse(i.pin.at) < 10 * MIN) || (!!i.phoneAt && i.now - Date.parse(i.phoneAt) < 5 * MIN);
  return phone ? "Not on the laptop. Probably on my phone." : null;
}

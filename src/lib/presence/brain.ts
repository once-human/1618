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
import { timeAgo } from "@/lib/time";
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
  /** A time that goes quietly after the sentence ("pushed 4m ago", "20 minutes in"), not inside it. */
  note?: string;
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
  // A song that just ended is still the last thing I played: it stays for about five minutes after it (a song runs three or four).
  const song = i.music && (i.music.nowPlaying || ago(i.music.at, now) < 8 * MIN) ? i.music : null;
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
  // Claude Code: the session says so, or the Claude app was in front of me within five minutes.
  const withClaude = work?.via === "claude" || work?.via === "ai" || (!!r?.claudeAt && ago(r.claudeAt, now) < 5 * MIN);
  const tool = withClaude ? "Claude Code" : work?.via === "editor" ? work.app : null;

  const call = active && r?.call ? r.call : null;
  // YouTube only gets said once it has been a real stretch (15 minutes); a quick video stays private.
  const video = active && r?.media && r.media.source !== "music" && (r.media.source !== "youtube" || ago(r.media.since, now) >= 15 * MIN) ? r.media : null;
  const chat = active ? (r?.chat ?? null) : null;
  const focus = active ? (r?.focus ?? []) : [];

  const devices = new Set<"phone" | "laptop">();
  const song$ = (m: { track: string }) => `%%${m.track}%%`;

  // ---- a call beats everything ----
  if (call) {
    devices.add("laptop");
    const forMs = now - Date.parse(call.since);
    return { text: `${call.sure ? call.label : `Probably o${call.label.slice(1)}`}.`, note: forMs >= 15 * MIN ? `${dur(forMs)} in` : undefined, devices: [...devices] };
  }

  // ---- code, with whatever plays alongside ----
  if (coding && repo) {
    devices.add("laptop");
    const s = `${seed}|code|${repo}`;
    // The time goes after the sentence, quiet, like "· 23m ago" on the bed line.
    const note = i.push && i.push.repo === repo ? `pushed ${timeAgo(i.push.at, now)}` : work ? `working since ${clockOf(work.since)}` : "";
    let text = `Working on @@${repo}@@${tool ? ` with ${tool === "Claude Code" ? "**Claude Code**" : tool}` : ""}`;
    if (music) {
      if (musicOnPhone) devices.add("phone");
      text += music.nowPlaying ? say([`, to ${song$(music)}`, `, ${song$(music)} on`], `${s}|m`) : `, just played ${song$(music)}`;
    } else if (video) text += video.source === "youtube" ? ", YouTube on the side" : ", something on in the background";
    text += ".";
    if (pinning) {
      devices.add("phone");
      text += " Saving pins on the side.";
    }
    return { text, note: note || undefined, devices: [...devices] };
  }
  if (coding && withClaude) {
    devices.add("laptop");
    return { text: say(["Working on something with **Claude Code**.", "Building something with **Claude Code**."], `${seed}|code`), devices: [...devices] };
  }

  // ---- music (the phone first) ----
  if (music) {
    devices.add(musicOnPhone ? "phone" : "laptop");
    const s = `${seed}|music|${music.track}`;
    let text = music.nowPlaying
      ? say([`Listening to ${song$(music)} by {artist}`, `${song$(music)} by {artist} on`, `Headphones on, ${song$(music)} by {artist}`], s, music)
      : say([`Just played ${song$(music)} by {artist}`], s, music);
    if (pinning) {
      devices.add("phone");
      text += ", saving pins";
    } else if (chat) {
      devices.add("laptop");
      text += `, texting on **${chat.name}**`;
    } else if (active && !video) {
      const c = focusClause(focus, `${s}|f`);
      if (c) {
        devices.add("laptop");
        text += `, ${c}`;
      }
    }
    return { text: text + ".", devices: [...devices] };
  }

  // ---- something playing on the laptop ----
  if (video) {
    devices.add("laptop");
    const s = `${seed}|video|${video.source}`;
    const forMs = now - Date.parse(video.since);
    let text: string;
    if (video.source === "youtube")
      text =
        forMs >= 45 * MIN && (video.videos ?? 0) >= 3
          ? say(["YouTube rabbit hole, {n} videos in", "{n} YouTube videos deep"], s, { n: video.videos })
          : say(["Watching a **YouTube** video", "On **YouTube**, don't ask", "**YouTube** break"], s);
    else text = say(["Watching something on **Netflix**", "Streaming something on **Netflix**", "On **Netflix**"], s);
    if (phoneUp) {
      devices.add("phone");
      text += ", phone in hand too";
    }
    return { text: text + ".", devices: [...devices] };
  }

  // ---- a long chat ----
  if (chat) {
    devices.add("laptop");
    return { text: say(["Texting on **{name}**, probably.", "Deep in **{name}** chats.", "Catching up on **{name}**."], `${seed}|chat`, chat), devices: [...devices] };
  }

  // ---- the phone on its own ----
  if (phoneUp) {
    devices.add("phone");
    const s = `${seed}|phone`;
    const text = pinning ? say(["Saving pins to **{board}**.", "On Pinterest, saving to **{board}**."], s, { board: pinning.board ?? "a board" }) : say(["On my phone.", "Phone in hand."], s);
    return { text, devices: [...devices] };
  }

  // ---- just the laptop, by what's mostly been in front of me ----
  if (active && focus.length) {
    devices.add("laptop");
    const c = focusClause(focus, `${seed}|solo`);
    if (c) return { text: c.charAt(0).toUpperCase() + c.slice(1) + ".", devices: [...devices] };
  }
  return null;
}

const clockOf = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(11, 16);

/** "texting on WhatsApp, probably", "switching between Telegram and Chrome"… or null when there's nothing worth saying. */
export function focusClause(focus: { name: string; category: string; share: number }[], seed: string): string | null {
  const [a, b] = focus;
  if (!a) return null;
  if (b && a.share < 0.55 && b.share >= 0.25 && a.category !== b.category) return say(["switching between **{a}** and **{b}**", "juggling **{a}** and **{b}**"], seed, { a: a.name, b: b.name });
  const v = { name: a.name };
  switch (a.category) {
    case "chat":
      return say(["texting on **{name}**, probably", "on **{name}**"], seed, v);
    case "ai":
      return say(["chatting with **{name}**", "thinking out loud with **{name}**"], seed, v);
    case "browser":
      return say(["browsing in **{name}**", "somewhere on the internet"], seed, v);
    case "files":
      return "digging through files";
    case "tool":
      return "tweaking settings";
    case "notes":
      return say(["writing in **{name}**", "taking notes in **{name}**"], seed, v);
    case "design":
      return say(["designing in **{name}**", "pushing pixels in **{name}**"], seed, v);
    case "editor":
    case "ide":
      return "writing code";
    case "terminal":
      return "in the terminal";
    default:
      return say(["in **{name}**", "using **{name}**"], seed, v);
  }
}

/** The second line's device bit: "On the laptop: 100%, plugged in, CPU 55%, 9.4 of 31.6 GB memory." Only while I'm at it. */
export function laptopLine(desk: DeskLive | null): string | null {
  const r = desk?.online && desk.active ? desk.recent : null;
  if (!r) return desk?.online && desk.active ? "On the laptop." : null;
  const bits: string[] = [];
  if (r.battery) bits.push(`${r.battery.pct}%${r.battery.charging ? (r.battery.pct >= 100 ? ", plugged in" : ", charging") : ""}`);
  if (r.sys) {
    // Memory as one pool: RAM plus swap (zram included).
    const used = Math.round((r.sys.memGB + (r.sys.swapGB ?? 0)) * 10) / 10;
    const total = Math.round((r.sys.totalGB + (r.sys.swapTotalGB ?? 0)) * 10) / 10;
    bits.push(`CPU ${Math.round(r.sys.cpu)}%`, `${used} of ${total} GB memory`);
  }
  return bits.length ? `On the laptop: ${bits.join(", ")}.` : "On the laptop.";
}

/** When I'm not at the laptop but my phone's doing something: say so instead of the laptop's numbers. */
export function phoneLine(i: BrainInput, text: string): string | null {
  const online = !!i.desk?.online;
  if (online && i.desk?.active) return null;
  if (/phone|Pinterest/i.test(text)) return null;
  const phone = !!i.music?.nowPlaying || (!!i.pin && Date.now() - Date.parse(i.pin.at) < 10 * MIN) || (!!i.phoneAt && i.now - Date.parse(i.phoneAt) < 5 * MIN);
  return phone ? "Probably on my phone." : null;
}

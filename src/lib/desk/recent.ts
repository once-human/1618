/**
 * The last few minutes of the laptop, boiled down: what I mostly had in front
 * of me (by time, so flicking through ten workspaces doesn't count as ten
 * things), whether I've been working on code lately, what's playing and for
 * how long, battery and how busy the machine is. The site's brain
 * (presence/brain.ts) reads this together with my phone.
 */
import { callLabel, mainApp, settle, type Sample } from "./model";

export interface DeskRecent {
  /** Apps by share of focused time in the last five minutes, biggest first. */
  focus: { name: string; category: string; share: number }[];
  /** Code in the last 15 minutes: Claude Code, an editor or a terminal in a repo, or the Claude app. */
  work: { repo: string | null; via: "claude" | "editor" | "terminal" | "ai"; app: string | null; at: string; since: string } | null;
  /** The last time the Claude app was in front of me, in the last 15 minutes. */
  claudeAt: string | null;
  /** A call going on now (the microphone is recording). */
  /** `sure`: the microphone has been on for five minutes straight; before that (but past four checks) it's only a guess. */
  call: { label: string; since: string; sure: boolean } | null;
  /** A stretch of chatting: five minutes or more in a chat app in the last twenty. */
  chat: { name: string; minutes: number } | null;
  /** What's playing on the laptop right now, and since when. */
  media: { source: "youtube" | "browser" | "music"; title: string | null; artist: string | null; videos: number | null; since: string; browser: string | null } | null;
  battery: { pct: number; charging: boolean } | null;
  sys: Sample["sys"];
}

const MIN = 60_000;

/** `samples` oldest first; only the last 15 minutes are looked at. */
export function recent(samples: Sample[], now: number): DeskRecent {
  const ss = settle(samples).filter((s) => Date.parse(s.t) >= now - 15 * MIN);
  const last = ss[ss.length - 1] ?? null;

  // Focus: dwell seconds when the agent sends them, else each sample counts for its 30 seconds.
  const weight = new Map<string, { name: string; category: string; s: number }>();
  for (const s of ss) {
    if (!s.active || Date.parse(s.t) < now - 5 * MIN) continue;
    const items = s.focus?.length ? s.focus : s.app ? [{ ...s.app, s: 30 }] : [];
    for (const f of items) {
      const cur = weight.get(f.name) ?? { name: f.name, category: f.category, s: 0 };
      cur.s += f.s;
      weight.set(f.name, cur);
    }
  }
  const total = [...weight.values()].reduce((a, b) => a + b.s, 0);
  const focus = [...weight.values()]
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((f) => ({ name: f.name, category: f.category, share: total ? Math.round((f.s / total) * 100) / 100 : 0 }));

  // Work: the newest sign of code in the last 15 minutes; it sticks for that long, so a detour to WhatsApp doesn't end it.
  let work: DeskRecent["work"] = null;
  let aiSecs = 0;
  for (const s of ss) {
    if (!s.active) continue;
    const app = mainApp(s);
    const items = s.focus?.length ? s.focus : app ? [{ ...app, s: 30 }] : [];
    aiSecs += items.filter((f) => f.category === "ai").reduce((a, f) => a + f.s, 0);
    const via = s.claude ? "claude" : app && (app.category === "editor" || app.category === "ide") ? "editor" : app?.category === "terminal" && s.repo ? "terminal" : null;
    if (via) work = { repo: s.repo, via, app: via === "claude" ? "Claude Code" : (app?.name ?? null), at: s.t, since: work && work.repo === s.repo ? work.since : s.t };
  }
  // A few minutes in the Claude app counts as working with Claude, repo unknown (the brain fills it in from GitHub).
  if (!work && aiSecs >= 120) {
    const firstAi = ss.find((s) => (s.focus ?? []).some((f) => f.category === "ai") || s.app?.category === "ai");
    const lastAi = [...ss].reverse().find((s) => (s.focus ?? []).some((f) => f.category === "ai") || s.app?.category === "ai");
    if (firstAi && lastAi) work = { repo: null, via: "ai", app: "Claude Code", at: lastAi.t, since: firstAi.t };
  }
  const isAi = (s: Sample) => (s.focus ?? []).some((f) => f.category === "ai") || s.app?.category === "ai";
  const claudeAt = [...ss].reverse().find((s) => s.active && isAi(s))?.t ?? null;

  // A call: the microphone in use in the newest sample, and since when.
  let call: DeskRecent["call"] = null;
  if (last?.call && Date.parse(last.t) >= now - 4 * MIN) {
    let since = last.t;
    for (let i = ss.length - 1; i >= 0 && ss[i].call; i--) since = ss[i].t;
    // Four checks in a row (about 90 seconds) is "probably a call"; five minutes straight is a call.
    // A burst of dictation shorter than that never gets a mention.
    const forMs = Date.parse(last.t) - Date.parse(since);
    if (forMs >= 90_000) call = { label: callLabel(last), since, sure: forMs >= 5 * MIN };
  }

  // Chat: dwell in chat apps over the last 20 minutes.
  const chatSecs = new Map<string, number>();
  for (const s of ss) {
    if (!s.active || Date.parse(s.t) < now - 20 * MIN) continue;
    const items = s.focus?.length ? s.focus : s.app ? [{ ...s.app, s: 30 }] : [];
    for (const f of items) if (f.category === "chat") chatSecs.set(f.name, (chatSecs.get(f.name) ?? 0) + f.s);
  }
  const topChat = [...chatSecs].sort((a, b) => b[1] - a[1])[0];
  const chat = topChat && topChat[1] >= 300 ? { name: topChat[0], minutes: Math.round(topChat[1] / 60) } : null;

  // Media: the latest state, and how long it's been the same kind of thing playing.
  let media: DeskRecent["media"] = null;
  const kind = (s: Sample): "youtube" | "browser" | "music" | null => (s.media?.state === "playing" ? (s.media.source === "youtube" ? "youtube" : s.media.source === "browser" ? "browser" : "music") : null);
  if (last && Date.parse(last.t) >= now - 4 * MIN && kind(last)) {
    let k = kind(last)!;
    // The browser's own player often hides that it's YouTube; if YouTube showed up in the last 15 minutes, it's YouTube.
    if (k === "browser" && ss.some((s) => s.media?.source === "youtube")) k = "youtube";
    let since = last.t;
    const same = (s: Sample) => kind(s) === k || (k === "youtube" && kind(s) === "browser");
    for (let i = ss.length - 1; i >= 0 && same(ss[i]); i--) since = ss[i].t;
    const app = mainApp(last);
    media = {
      source: k,
      title: k === "music" ? last.media!.title : null,
      artist: k === "music" ? last.media!.artist : null,
      videos: last.media!.videos ?? null,
      since,
      browser: app?.category === "browser" ? app.name : null,
    };
  }
  return { focus, work, claudeAt, call, chat, media, battery: last?.battery ?? null, sys: last?.sys ?? null };
}

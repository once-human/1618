/**
 * The laptop, as the site understands it. The agent on the laptop sends a
 * sample about once a minute: what's focused (as a category and an app name,
 * never a window title), which site (host name only), which repo, whether a
 * Claude Code session is working, what's playing. This file cleans a sample,
 * works out what I'm "doing", folds samples into spans, and rolls a day up.
 * Pure functions, unit-tested in model.test.ts.
 */

export const GAP_MS = 150_000; // samples further apart than this are a break (laptop off or the agent stopped)
export const STEP_MS = 60_000; // how long a lone sample counts for

export type Kind = "claude" | "coding" | "terminal" | "watching" | "browsing" | "chat" | "writing" | "design" | "music" | "ai" | "files" | "tool" | "call" | "other" | "idle";

export interface Sample {
  t: string;
  active: boolean;
  idleS: number;
  app: { id: string; name: string; category: string } | null;
  site: { host: string; name: string; category: string } | null;
  repo: string | null;
  claude: boolean;
  media: { player: string; state: "playing" | "paused"; source: string; title: string | null; artist: string | null; videos: number | null } | null;
  battery: { pct: number; charging: boolean } | null;
  /** Seconds each app was focused in this sample's 30 seconds, longest first. */
  focus: { id: string; name: string; category: string; s: number }[];
  /** The microphone is recording: a call, almost always. */
  call: boolean;
  /** How hard the laptop is working, and what the agent costs. */
  sys: { cpu: number; mem: number; memGB: number; totalGB: number; swapGB: number; swapTotalGB: number; agentMB: number; agentCPU: number; guiMB: number; uptimeH: number } | null;
}

/** Things that never go on the site, whatever the agent says. */
const NEVER = /porn|xxx|xvideos|xnxx|xhamster|redtube|youporn|onlyfans|rule34|hentai|brazzers|chaturbate|stripchat|spankbang|nsfw|\badult\b|\bsex/i;
/** YouTube videos are named nowhere: only that I'm watching. */
const YOUTUBE = /youtube\.com|youtu\.be|ytimg|youtube/i;

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const cat = (v: unknown) => (str(v, 24) ?? "other").toLowerCase().replace(/[^a-z-]/g, "");

/** Apps an older agent doesn't know the category of (the agent's own catalog has these too). */
const KNOWN: Record<string, { name: string; category: string }> = {
  "com.anthropic.claude": { name: "Claude", category: "ai" },
  "in.onkaryaglewad.deskagent": { name: "desk-agent", category: "tool" },
  "org.telegram.desktop": { name: "Telegram", category: "chat" },
  "org.kde.dolphin": { name: "Files", category: "files" },
  thunar: { name: "Files", category: "files" },
  "org.gnome.nautilus": { name: "Files", category: "files" },
};
const WEBAPP: Record<string, { name: string; category: string }> = {
  "web.whatsapp.com": { name: "WhatsApp", category: "chat" },
  "web.telegram.org": { name: "Telegram", category: "chat" },
  "discord.com": { name: "Discord", category: "chat" },
  "claude.ai": { name: "Claude", category: "ai" },
  "chatgpt.com": { name: "ChatGPT", category: "ai" },
  "www.figma.com": { name: "Figma", category: "design" },
  "mail.google.com": { name: "Gmail", category: "chat" },
};
export function fixApp<T extends { id: string; name: string; category: string }>(a: T): T {
  const id = a.id.toLowerCase();
  if (KNOWN[id] && a.category === "other") return { ...a, ...KNOWN[id] };
  const web = /^(?:chrome|chromium|brave|msedge)-([^_]+)__/.exec(id)?.[1];
  if (web && WEBAPP[web] && (a.category === "other" || a.category === "chat")) return { ...a, ...WEBAPP[web] };
  return a;
}

/** A sample from the agent, made safe: unknown fields dropped, lengths capped, adult sites and YouTube titles removed. */
export function cleanSample(raw: unknown): Sample | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const t = typeof o.t === "string" ? Date.parse(o.t) : NaN;
  if (!Number.isFinite(t)) return null;
  const app = o.app && typeof o.app === "object" ? (o.app as Record<string, unknown>) : null;
  const site = o.site && typeof o.site === "object" ? (o.site as Record<string, unknown>) : null;
  const media = o.media && typeof o.media === "object" ? (o.media as Record<string, unknown>) : null;
  const battery = o.battery && typeof o.battery === "object" ? (o.battery as Record<string, unknown>) : null;

  let siteOut: Sample["site"] = null;
  const host = site ? str(site.host, 80)?.toLowerCase().replace(/^www\./, "") ?? null : null;
  if (site && host) {
    const name = str(site.name, 40) ?? host;
    siteOut = NEVER.test(host) || NEVER.test(name) ? { host: "", name: "a private site", category: "private" } : { host, name, category: cat(site.category) };
  }
  let mediaOut: Sample["media"] = null;
  if (media) {
    const source = (str(media.source, 24) ?? "other").toLowerCase();
    const yt = YOUTUBE.test(source) || YOUTUBE.test(String(media.player ?? "")) || (siteOut ? YOUTUBE.test(siteOut.host) : false);
    const bad = NEVER.test(`${media.title ?? ""} ${media.artist ?? ""}`);
    mediaOut = {
      player: str(media.player, 24) ?? "player",
      state: media.state === "playing" ? "playing" : "paused",
      source: yt ? "youtube" : source,
      title: yt || bad ? null : str(media.title, 120),
      artist: yt || bad ? null : str(media.artist, 120),
      videos: yt && typeof media.videos === "number" && media.videos >= 0 ? Math.min(999, Math.round(media.videos)) : null,
    };
  }
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v * 10) / 10)) : 0);
  const sys = o.sys && typeof o.sys === "object" ? (o.sys as Record<string, unknown>) : null;
  const focus = Array.isArray(o.focus)
    ? (o.focus as unknown[])
        .slice(0, 4)
        .flatMap((f) => {
          if (!f || typeof f !== "object") return [];
          const x = f as Record<string, unknown>;
          const s = num(x.s, 600);
          return s > 0 ? [fixApp({ id: str(x.id, 60) ?? "app", name: str(x.name, 40) ?? "an app", category: cat(x.category), s })] : [];
        })
    : [];
  return {
    t: new Date(t).toISOString(),
    focus,
    call: o.call === true,
    sys: sys
      ? { cpu: num(sys.cpu, 100), mem: num(sys.mem, 100), memGB: num(sys.memGB, 4096), totalGB: num(sys.totalGB, 4096), swapGB: num(sys.swapGB, 4096), swapTotalGB: num(sys.swapTotalGB, 4096), agentMB: num(sys.agentMB, 100000), agentCPU: num(sys.agentCPU, 1600), guiMB: num(sys.guiMB, 100000), uptimeH: num(sys.uptimeH, 100000) }
      : null,
    active: o.active === true,
    idleS: typeof o.idleS === "number" && o.idleS >= 0 ? Math.min(86400, Math.round(o.idleS)) : 0,
    app: app ? fixApp({ id: str(app.id, 60) ?? "app", name: str(app.name, 40) ?? "an app", category: cat(app.category) }) : null,
    site: siteOut,
    repo: str(o.repo, 60),
    claude: o.claude === true,
    media: mediaOut,
    battery: battery && typeof battery.pct === "number" ? { pct: Math.max(0, Math.min(100, Math.round(battery.pct))), charging: battery.charging === true } : null,
  };
}

export interface Doing {
  kind: Kind;
  /** "Working with Claude Code", "Coding", "Watching YouTube", "On GitHub"… */
  label: string;
  /** The repo or site, when it's worth naming: "1618", "github.com". */
  detail: string | null;
}

/** What I'm doing, from one sample. Claude first, then code, then the site, then the app. */
const CALL_APPS: [RegExp, string][] = [
  [/meet/i, "Google Meet"],
  [/zoom/i, "Zoom"],
  [/discord|vesktop/i, "Discord"],
  [/teams/i, "Teams"],
  [/slack/i, "Slack"],
  [/whatsapp/i, "WhatsApp"],
  [/telegram/i, "Telegram"],
];
/** "On a call on Google Meet", from whichever call app was in front of me, or just "On a call". */
export function callLabel(s: Pick<Sample, "focus" | "app" | "site">): string {
  const names = [...(s.focus ?? []).map((f) => `${f.id} ${f.name}`), s.app ? `${s.app.id} ${s.app.name}` : "", s.site?.host ?? ""];
  for (const [re, name] of CALL_APPS) if (names.some((n) => re.test(n))) return `On a call on ${name}`;
  return "On a call";
}

/** The app I mostly had in front of me during the sample (not just the last one flicked to). */
export function mainApp(s: Sample): Sample["app"] {
  const f = s.focus?.[0];
  return f ? { id: f.id, name: f.name, category: f.category } : s.app;
}

export function doing(s: Sample): Doing {
  if (!s.active) return { kind: "idle", label: "Away from the laptop", detail: null };
  const app = mainApp(s);
  if (s.call) return { kind: "call", label: callLabel(s), detail: null };
  if (s.claude) return { kind: "claude", label: "Working with Claude Code", detail: s.repo };
  const ytPlaying = s.media?.source === "youtube" && s.media.state === "playing";
  if (ytPlaying && (!app || app.category === "browser" || app.category === "media")) return { kind: "watching", label: "Watching YouTube", detail: null };
  if (app && (app.category === "editor" || app.category === "ide")) return { kind: "coding", label: "Coding", detail: s.repo };
  if (app?.category === "terminal") return { kind: "terminal", label: s.repo ? "In the terminal" : "In the terminal", detail: s.repo };
  if (s.site && (!app || app.category === "browser")) {
    const c = s.site.category;
    if (c === "private") return { kind: "browsing", label: "Browsing", detail: null };
    if (YOUTUBE.test(s.site.host) || (s.media?.source === "youtube" && s.media.state === "playing")) return { kind: "watching", label: "Watching YouTube", detail: null };
    if (c === "video" || c === "stream") return { kind: "watching", label: `Watching ${s.site.name}`, detail: null };
    if (c === "code") return { kind: "coding", label: `On ${s.site.name}`, detail: s.site.host };
    if (c === "mail") return { kind: "writing", label: "In email", detail: s.site.name };
    if (c === "docs" || c === "writing") return { kind: "writing", label: `In ${s.site.name}`, detail: null };
    if (c === "chat" || c === "social") return { kind: "chat", label: `On ${s.site.name}`, detail: null };
    if (c === "music") return { kind: "music", label: `On ${s.site.name}`, detail: null };
    if (c === "design") return { kind: "design", label: `In ${s.site.name}`, detail: null };
    return { kind: "browsing", label: `On ${s.site.name}`, detail: s.site.host };
  }
  if (app) {
    if (app.category === "chat") return { kind: "chat", label: `In ${app.name}`, detail: null };
    if (app.category === "design") return { kind: "design", label: `In ${app.name}`, detail: null };
    if (app.category === "browser") return s.media?.source === "browser" && s.media.state === "playing" ? { kind: "watching", label: "Watching Netflix", detail: null } : { kind: "browsing", label: "Browsing", detail: null };
    if (app.category === "ai") return { kind: "ai", label: `In ${app.name}`, detail: null };
    if (app.category === "files") return { kind: "files", label: "In the file manager", detail: null };
    if (app.category === "notes") return { kind: "writing", label: `In ${app.name}`, detail: null };
    if (app.category === "tool") return { kind: "tool", label: `In ${app.name}`, detail: null };
    if (app.category === "media") return { kind: "watching", label: `In ${app.name}`, detail: null };
    return { kind: "other", label: `In ${app.name}`, detail: null };
  }
  return { kind: "other", label: "At the laptop", detail: null };
}

/** What's playing, as a line: a track by name, or just "a YouTube video"; null when nothing is playing. */
export function playing(s: Sample): { label: string; detail: string | null; key: string } | null {
  const m = s.media;
  if (!m || m.state !== "playing") return null;
  if (m.source === "youtube") return { label: "Watching YouTube", detail: m.videos ? `${m.videos} video${m.videos === 1 ? "" : "s"} so far` : null, key: "youtube" };
  if (m.title) return { label: m.title, detail: m.artist, key: `${m.title}|${m.artist ?? ""}` };
  return { label: `Playing on ${m.player}`, detail: null, key: m.player };
}

export interface Span {
  lane: "laptop" | "doing" | "media";
  /** For laptop: "active" or "idle". For doing: a Kind. For media: "track" or "youtube". */
  kind: string;
  label: string;
  detail: string | null;
  start: string;
  end: string;
}

/** Samples, oldest first, folded into spans per lane; a gap longer than GAP_MS ends every span (the laptop was off). */
/** Ten minutes in one browser, nothing playing, no call: nobody is there, whatever the compositor says (a tab holding the screen awake stops it noticing). */
export const STALE_MS = 10 * 60_000;

/**
 * The agent trusts the desktop's idle timer, which a browser tab can hold at zero for hours. So a long stretch
 * of the same browser (and site), with nothing playing and no call, counts as away after the first ten minutes.
 * Coding, the terminal, Claude, calls and anything playing are left as they are.
 */
export function settle(samples: Sample[]): Sample[] {
  const sorted = [...samples].sort((a, b) => a.t.localeCompare(b.t));
  let key = "";
  let from = 0;
  let prev = -Infinity;
  return sorted.map((s) => {
    const t = Date.parse(s.t);
    const app = mainApp(s);
    const still = s.active && !s.call && !s.claude && app?.category === "browser" && s.media?.state !== "playing";
    const k = still ? `${app!.id}|${s.site?.host ?? ""}` : "";
    if (!k || k !== key || t - prev > GAP_MS) {
      key = k;
      from = t;
    }
    prev = t;
    return k && t - from >= STALE_MS ? { ...s, active: false, idleS: Math.max(s.idleS, Math.round((t - from) / 1000)) } : s;
  });
}

export function buildSpans(samples: Sample[]): Span[] {
  const spans: Span[] = [];
  const open: Partial<Record<Span["lane"], Span & { key: string }>> = {};
  const close = (lane: Span["lane"]) => {
    const o = open[lane];
    if (o) {
      const { key: _k, ...rest } = o;
      void _k;
      spans.push(rest);
      delete open[lane];
    }
  };
  let prev = -Infinity;
  const sorted = settle(samples);
  sorted.forEach((s, i) => {
    const t = Date.parse(s.t);
    if (t - prev > GAP_MS) {
      for (const l of ["laptop", "doing", "media"] as const) close(l);
    }
    const next = sorted[i + 1] ? Date.parse(sorted[i + 1].t) : NaN;
    const end = new Date(Math.min(t + STEP_MS, Number.isFinite(next) && next - t <= GAP_MS ? next : t + STEP_MS)).toISOString();
    const d = doing(s);
    const p = playing(s);
    const items: [Span["lane"], string, string, string, string | null][] = [
      ["laptop", s.active ? "active" : "idle", s.active ? "active" : "idle", s.active ? "At the laptop" : "Idle", null],
      ["doing", d.kind, `${d.kind}|${d.label}|${d.detail ?? ""}`, d.label, d.detail],
    ];
    if (p) items.push(["media", p.key === "youtube" ? "youtube" : "track", p.key, p.label, p.detail]);
    const present = new Set(items.map((x) => x[0]));
    for (const lane of ["laptop", "doing", "media"] as const) if (!present.has(lane)) close(lane);
    for (const [lane, kind, key, label, detail] of items) {
      const o = open[lane];
      if (o && o.key === key) o.end = end;
      else {
        close(lane);
        open[lane] = { lane, kind, key, label, detail, start: s.t, end };
      }
    }
    prev = t;
  });
  for (const l of ["laptop", "doing", "media"] as const) close(l);
  return spans.sort((a, b) => a.start.localeCompare(b.start));
}

const mins = (s: Span) => Math.max(0, (Date.parse(s.end) - Date.parse(s.start)) / 60_000);

export interface DayRollup {
  /** Minutes at the laptop (active) and idle but on. */
  activeMin: number;
  idleMin: number;
  /** Minutes per kind of doing. */
  byKind: Record<string, number>;
  repos: { name: string; min: number }[];
  sites: { name: string; min: number }[];
  tracks: { label: string; detail: string | null; min: number }[];
  youtubeMin: number;
  claudeMin: number;
  /** First and last time at the laptop that day. */
  first: string | null;
  last: string | null;
}

/** A day's spans, boiled down for the long-term record. */
export function rollup(spans: Span[]): DayRollup {
  const byKind: Record<string, number> = {};
  const repos = new Map<string, number>();
  const sites = new Map<string, number>();
  const tracks = new Map<string, { label: string; detail: string | null; min: number }>();
  let activeMin = 0;
  let idleMin = 0;
  let youtubeMin = 0;
  let claudeMin = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const s of spans) {
    const m = mins(s);
    if (s.lane === "laptop") {
      if (s.kind === "active") {
        activeMin += m;
        if (!first || s.start < first) first = s.start;
        if (!last || s.end > last) last = s.end;
      } else idleMin += m;
    } else if (s.lane === "doing") {
      if (s.kind === "idle") continue;
      byKind[s.kind] = (byKind[s.kind] ?? 0) + m;
      if (s.kind === "claude") claudeMin += m;
      if ((s.kind === "claude" || s.kind === "coding" || s.kind === "terminal") && s.detail && !s.detail.includes(".")) repos.set(s.detail, (repos.get(s.detail) ?? 0) + m);
      if (s.kind === "browsing" || s.kind === "coding" || s.kind === "chat" || s.kind === "watching") {
        const name = s.label.replace(/^(On|In|Watching) /, "");
        if (s.kind !== "watching" || name !== "YouTube") sites.set(name, (sites.get(name) ?? 0) + m);
      }
    } else {
      if (s.kind === "youtube") youtubeMin += m;
      else {
        const k = `${s.label}|${s.detail ?? ""}`;
        const cur = tracks.get(k) ?? { label: s.label, detail: s.detail, min: 0 };
        cur.min += m;
        tracks.set(k, cur);
      }
    }
  }
  const top = <T extends { min: number }>(xs: T[], n: number) => xs.sort((a, b) => b.min - a.min).slice(0, n).map((x) => ({ ...x, min: Math.round(x.min) }));
  return {
    activeMin: Math.round(activeMin),
    idleMin: Math.round(idleMin),
    byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, Math.round(v)])),
    repos: top([...repos].map(([name, min]) => ({ name, min })), 5),
    sites: top([...sites].map(([name, min]) => ({ name, min })), 6),
    tracks: top([...tracks.values()], 5),
    youtubeMin: Math.round(youtubeMin),
    claudeMin: Math.round(claudeMin),
    first,
    last,
  };
}

export interface Live {
  /** The agent has reported in the last few minutes. */
  online: boolean;
  lastSeen: string | null;
  active: boolean;
  /** The last time the laptop was in use, even when it is off now. */
  lastActive: string | null;
  doing: Doing | null;
  /** When the current doing began (same label and repo/site, no long gap). */
  doingSince: string | null;
  playing: { label: string; detail: string | null } | null;
  /** The last few minutes, boiled down (see recent.ts); filled in by the server. */
  recent?: import("./recent").DeskRecent | null;
}

/** The key that says two samples are the same activity. */
export const doingKey = (s: Sample) => {
  const d = doing(s);
  return `${d.kind}|${d.label}|${d.detail ?? ""}`;
};

/** The live state from the newest sample. "Online" means a sample in the last 4 minutes: after that the laptop is just "away", never guessed. */
export function live(latest: Sample | null, now: number, lastActive: string | null = null, since: { key: string; at: string } | null = null, expectUntil: string | null = null): Live {
  if (!latest) return { online: false, lastSeen: null, active: false, lastActive, doing: null, doingSince: null, playing: null };
  // The agent uploads in batches: between them it is still there until the next one is due.
  const online = now - Date.parse(latest.t) <= 4 * 60_000 || (!!expectUntil && Date.parse(expectUntil) > now);
  if (!online) return { online: false, lastSeen: latest.t, active: false, lastActive, doing: null, doingSince: null, playing: null };
  const d = doing(latest);
  const p = playing(latest);
  return { online: true, lastSeen: latest.t, active: latest.active, lastActive: latest.active ? latest.t : lastActive, doing: d, doingSince: since && since.key === doingKey(latest) ? since.at : latest.t, playing: p ? { label: p.label, detail: p.detail } : null };
}

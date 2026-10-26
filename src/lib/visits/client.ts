"use client";

import { botReason, isBotAgent, whenHuman } from "@/lib/bots";
import { IDLE_MS, MAX_EVENTS, cleanPath, refHost, type TrackBatch, type TrackEvent } from "./shared";

/**
 * The browser's side of the visitor log: which pages, in what order, for how
 * long (only while on screen), how far down, and which links out. Batched and
 * sent every few seconds, and when the tab is hidden or closed.
 *
 * Nothing is sent if the visitor has turned it off on /privacy, or if their
 * browser asks sites not to track (Global Privacy Control, Do Not Track).
 */
const VID = "1618-vid";
const VISIT = "1618-visit";
export const OFF = "1618-track";

const rand = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
const store = {
  get: (s: Storage, k: string) => {
    try {
      return s.getItem(k);
    } catch {
      return null;
    }
  },
  set: (s: Storage, k: string, v: string) => {
    try {
      s.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

/** Does this browser ask not to be tracked, or has its visitor said so here? */
export function trackingOff(): boolean {
  if (typeof window === "undefined") return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return store.get(localStorage, OFF) === "off" || nav.globalPrivacyControl === true || navigator.doNotTrack === "1";
}

/** This browser's own random code (made here, never derived from anything about you). */
export function visitorCode(create = true): string | null {
  let v = store.get(localStorage, VID);
  if (!v && create) {
    v = rand();
    store.set(localStorage, VID, v);
  }
  return v;
}

let started = false;
let human = false;
let bot: string | null = null;
let visit = "";
let seq = 0;
let firstBatch = true;
const queue = new Map<number, TrackEvent>();
// The page on screen: its event is re-sent as its time and scroll grow.
let page: { ev: TrackEvent; shownAt: number | null; scrollMax: number } | null = null;

function visitId(): string {
  const raw = store.get(sessionStorage, VISIT);
  const now = Date.now();
  try {
    const v = raw ? (JSON.parse(raw) as { id: string; last: number; seq: number }) : null;
    if (v && now - v.last < IDLE_MS) {
      seq = v.seq;
      return v.id;
    }
  } catch {
    /* start over */
  }
  seq = 0;
  return rand();
}
const remember = () => store.set(sessionStorage, VISIT, JSON.stringify({ id: visit, last: Date.now(), seq }));

function push(e: Omit<TrackEvent, "seq" | "at">) {
  if (!started || seq >= MAX_EVENTS) return null;
  const ev: TrackEvent = { ...e, seq: seq++, at: Date.now() };
  queue.set(ev.seq, ev);
  remember();
  return ev;
}

function settlePage() {
  if (!page) return;
  if (page.shownAt != null) {
    page.ev.ms = (page.ev.ms ?? 0) + (Date.now() - page.shownAt);
    page.shownAt = document.visibilityState === "visible" ? Date.now() : null;
  }
  page.ev.scroll = Math.round(page.scrollMax);
  queue.set(page.ev.seq, { ...page.ev });
}

function send(final = false) {
  if (!started || trackingOff()) return;
  settlePage();
  if (!queue.size || (!human && !bot && !final)) return; // nothing new, or not sure yet it's a person
  const w = window.innerWidth;
  const batch: TrackBatch = {
    v: visitorCode()!,
    s: visit,
    human,
    bot,
    events: [...queue.values()],
    ...(firstBatch
      ? { ref: refHost(document.referrer, location.hostname), lang: navigator.language, screen: w < 640 ? "phone" : w < 1024 ? "tablet" : "desktop" }
      : {}),
  };
  const body = JSON.stringify(batch);
  const sent = final && navigator.sendBeacon ? navigator.sendBeacon("/api/track", body) : (void fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {}), true);
  if (sent) {
    queue.clear();
    firstBatch = false;
  }
}

/** Start logging this visit (once per page load). */
export function startTracking() {
  // A program that says so in its user agent is already logged by the server (src/proxy.ts).
  if (started || typeof window === "undefined" || trackingOff() || isBotAgent(navigator.userAgent)) return;
  started = true;
  visit = visitId();
  bot = botReason();
  void whenHuman().then(() => {
    human = true;
    send();
  });

  const onScroll = () => {
    if (!page) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    page.scrollMax = Math.max(page.scrollMax, max > 0 ? (window.scrollY / max) * 100 : 100);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!page) return;
    if (document.visibilityState === "hidden") send(true);
    else page.shownAt = Date.now();
  });
  window.addEventListener("pagehide", () => send(true));
  // Links out: which site, which link.
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      try {
        const u = new URL(a.href, location.href);
        if (u.origin === location.origin || !/^https?:$/.test(u.protocol)) return;
        push({ type: "click", path: cleanPath(location.pathname), detail: `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`.slice(0, 200) });
      } catch {
        /* not a link we can read */
      }
    },
    true,
  );
  setInterval(() => document.visibilityState === "visible" && send(), 15_000);
}

/** A new page on screen (called on every route change). */
export function trackPage(path: string) {
  if (!started) return;
  const p = cleanPath(path);
  if (page && page.ev.path === p) return;
  settlePage();
  const ev = push({ type: "page", path: p, ms: 0, scroll: 0 });
  page = ev ? { ev, shownAt: document.visibilityState === "visible" ? Date.now() : null, scrollMax: 0 } : null;
  send();
}

/** Something worth knowing they did: "sent a song", "played a preview"… */
export function track(action: string, detail?: string | null) {
  push({ type: "action", path: cleanPath(location.pathname), detail: `${action}${detail ? `: ${detail}` : ""}`.slice(0, 200) });
}

/**
 * Start over: forget this browser's code and the visit in progress, and drop
 * anything not yet sent, so nothing deleted can come back with the next batch.
 * The next page (if the log is on) starts a fresh visit under a new code.
 */
export function resetTracking() {
  queue.clear();
  page = null;
  seq = 0;
  firstBatch = true;
  visit = rand();
  try {
    localStorage.removeItem(VID);
    sessionStorage.removeItem(VISIT);
  } catch {
    /* nothing kept */
  }
}

/** Turn it off (or back on) for this browser. Off also forgets the code. */
export function setTracking(on: boolean) {
  store.set(localStorage, OFF, on ? "on" : "off");
  if (!on) resetTracking();
}

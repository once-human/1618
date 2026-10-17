"use client";

import { useSyncExternalStore } from "react";
import { isBotBrowser } from "@/lib/bots";
import type { RealtimeChannel, RealtimeClient } from "@supabase/realtime-js";
import { HERE_KEY as KEY, HERE_URL as URL } from "./here-config";
import { Roster, type Here } from "./roster";

export type { Here };

/**
 * Who's on the site right now, live.
 *
 * Every open tab joins one shared channel on Supabase Realtime. A person is a
 * device: the server hands each tab a daily code for its device (./device.ts),
 * so tabs, private windows and other browsers on one phone or laptop all
 * count once, and only someone else's device makes it two. If that code
 * can't be fetched, the tab falls back to one random id per browser.
 *
 * Two signals on that channel, merged by ./roster.ts: each tab announces
 * itself ("hi"/"bye") so the number moves within milliseconds, and the
 * server's presence list, which settles the truth a couple of seconds later
 * and catches tabs that vanish without a goodbye (a phone losing signal).
 *
 * A tab that's been in the background for a minute steps out, and steps back
 * in the moment you return, so "here" means someone actually looking. If the
 * connection fails, the count disappears rather than showing a number that
 * might be wrong.
 */

const TOPIC = "here";
const AWAY_AFTER = 60_000;
const ID = /^[A-Za-z0-9]{8,40}$/;

let state: Here | null = null;
const subs = new Set<() => void>();
function emit(next: Here | null) {
  if (next === state) return;
  if (
    next &&
    state &&
    next.people === state.people &&
    next.tabs === state.tabs &&
    next.mine === state.mine
  )
    return;
  state = next;
  subs.forEach((f) => f());
}

const random = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

let memoryId: string | undefined;
function browserId(): string {
  try {
    const have = localStorage.getItem("here-browser");
    if (have && ID.test(have)) return have;
    const id = random();
    localStorage.setItem("here-browser", id);
    return id;
  } catch {
    return (memoryId ??= random());
  }
}

/** What every browser on this device reports alike: the OS and the screen in real pixels. */
function traits() {
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const os = /Android/.test(ua)
    ? "android"
    : /iPhone|iPad|iPod/.test(ua) || touchMac
      ? "ios"
      : /CrOS/.test(ua)
        ? "chromeos"
        : /Mac/.test(ua)
          ? "mac"
          : /Win/.test(ua)
            ? "windows"
            : /Linux/.test(ua)
              ? "linux"
              : "other";
  const dpr = window.devicePixelRatio || 1;
  return { os, w: Math.round(screen.width * dpr), h: Math.round(screen.height * dpr) };
}

let deviceCache: { key: string; day: string; city?: string | null; country?: string | null } | null = null;
/** My town, as the server sees it; passed on to others as "someone in …". */
let myPlace: Place = { city: null, country: null };

/** This device's code for today, or this browser's own id if the server can't be reached. */
async function personKey(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  if (deviceCache?.day === today) return deviceCache.key;
  try {
    const kept = JSON.parse(sessionStorage.getItem("here-device") ?? "null");
    // (Codes saved before towns existed have no "city" field: fetch a fresh one.)
    if (kept?.day === today && ID.test(kept.key) && "city" in kept) {
      deviceCache = kept;
      myPlace = { city: kept.city ?? null, country: kept.country ?? null };
      return kept.key;
    }
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch("/api/here", {
      method: "POST",
      body: JSON.stringify(traits()),
      signal: AbortSignal.timeout(4000),
    });
    const got = (await res.json()) as { key?: string; day?: string; city?: string | null; country?: string | null };
    if (res.ok && got.key && ID.test(got.key) && got.day) {
      deviceCache = { key: got.key, day: got.day, city: got.city ?? null, country: got.country ?? null };
      myPlace = { city: got.city ?? null, country: got.country ?? null };
      try {
        sessionStorage.setItem("here-device", JSON.stringify(deviceCache));
      } catch {
        /* ignore */
      }
      return got.key;
    }
  } catch {
    /* fall through */
  }
  return browserId();
}

/** A new network (wifi to mobile data) means a new code. */
function forgetDevice() {
  deviceCache = null;
  try {
    sessionStorage.removeItem("here-device");
  } catch {
    /* ignore */
  }
}

/**
 * One id per tab that survives a reload (so a reload is the same tab coming
 * back, not someone leaving), but not a duplicated tab: it's only written on
 * the way out, and taken back on the way in.
 */
function tabId(): string {
  try {
    const have = sessionStorage.getItem("here-tab");
    sessionStorage.removeItem("here-tab");
    if (have && ID.test(have)) return have;
  } catch {
    /* no storage: a fresh id is fine */
  }
  return random();
}

let client: RealtimeClient | null = null;
let channel: RealtimeChannel | null = null;
let roster: Roster | null = null;
let tab = "";
let joining = false;
let awayTimer: ReturnType<typeof setTimeout> | null = null;
let tick: ReturnType<typeof setTimeout> | null = null;

/* ---- Who the others are: their town, and where they are on the page ---- */

export interface Place {
  city: string | null;
  country: string | null;
}
export interface Other extends Place {
  key: string;
  /** How far down the page they are, 0 to 1, and which page; null until they've said. */
  y: number | null;
  path: string | null;
}

const places = new Map<string, Place>();
const positions = new Map<string, { y: number; path: string }>();
let others: Other[] = [];
const otherSubs = new Set<() => void>();
let me = "";

function publishOthers() {
  if (!roster) return;
  const list = roster
    .people(Date.now())
    .filter((k) => k !== me)
    .map((k) => ({
      key: k,
      ...(places.get(k) ?? { city: null, country: null }),
      y: positions.get(k)?.y ?? null,
      path: positions.get(k)?.path ?? null,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  if (JSON.stringify(list) === JSON.stringify(others)) return;
  // Someone arrived: share where I am so their view fills in.
  const before = new Set(others.map((o) => o.key));
  if (list.some((o) => !before.has(o.key))) sendPosition(true);
  others = list;
  otherSubs.forEach((f) => f());
}

const clean = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);
function noteMeta(key: string, meta: { c?: unknown; cc?: unknown } | undefined) {
  if (!meta) return;
  places.set(key, { city: clean(meta.c, 60), country: clean(meta.cc, 2) });
}

/** Scroll positions are shared at most once a second, and only while few enough people are here. */
const MAX_FOR_DOTS = 8;
let lastSent = 0;
let posTimer: ReturnType<typeof setTimeout> | null = null;
function myPosition() {
  const max = document.documentElement.scrollHeight - innerHeight;
  return { y: max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0, path: location.pathname };
}
function sendPosition(soon = false) {
  if (!channel || (state?.people ?? 0) > MAX_FOR_DOTS || (state?.people ?? 0) < 2) return;
  if (posTimer) return;
  const wait = soon ? Math.random() * 1500 : Math.max(0, 1000 - (Date.now() - lastSent));
  posTimer = setTimeout(() => {
    posTimer = null;
    lastSent = Date.now();
    const p = myPosition();
    void channel?.send({ type: "broadcast", event: "pos", payload: { b: me, y: Math.round(p.y * 1000) / 1000, p: p.path.slice(0, 80) } });
  }, wait);
}
const onScroll = () => sendPosition();

/** Publish the count, and wake up again when a grace period runs out. */
function refresh() {
  if (!roster || !channel) return;
  const now = Date.now();
  emit(roster.count(now));
  publishOthers();
  if (tick) clearTimeout(tick);
  const next = roster.nextChange(now);
  tick = next == null ? null : setTimeout(refresh, Math.max(16, next - now + 5));
}

async function join() {
  // Automated and headless browsers aren't people; they don't count as here.
  if (channel || joining || isBotBrowser()) return;
  joining = true;
  try {
    // The device code and the realtime library load side by side.
    const [{ RealtimeClient }, myKey] = await Promise.all([
      import("@supabase/realtime-js"),
      personKey(),
    ]);
    client ??= new RealtimeClient(`${URL}/realtime/v1`, {
      params: { apikey: KEY },
      heartbeatIntervalMs: 15_000,
      // Heartbeats run in a worker, so a background tab's throttled timers
      // don't get it mistaken for gone.
      worker: true,
    });
    tab = tabId();
    me = myKey;
    const r = new Roster(myKey);
    const ch = client.channel(TOPIC, {
      config: { presence: { key: myKey }, broadcast: { self: false } },
    });
    channel = ch;
    roster = r;

    ch.on("presence", { event: "sync" }, () => {
      if (channel !== ch) return;
      const all = ch.presenceState<{ t?: string; c?: string; cc?: string }>();
      const view: Record<string, string[]> = {};
      for (const b in all) {
        view[b] = all[b].map((m) => (typeof m.t === "string" ? m.t : m.presence_ref));
        noteMeta(b, all[b][0]);
      }
      r.sync(view, Date.now());
      refresh();
    });
    ch.on("broadcast", { event: "hi" }, ({ payload }) => {
      if (channel !== ch || !ID.test(payload?.t) || !ID.test(payload?.b)) return;
      noteMeta(payload.b, payload);
      r.hi(payload.t, payload.b, Date.now());
      refresh();
      // Someone new: let them see where everyone is.
      sendPosition(true);
    });
    ch.on("broadcast", { event: "pos" }, ({ payload }) => {
      if (channel !== ch || !ID.test(payload?.b) || typeof payload.y !== "number" || typeof payload.p !== "string") return;
      positions.set(payload.b, { y: Math.min(1, Math.max(0, payload.y)), path: payload.p.slice(0, 80) });
      publishOthers();
    });
    ch.on("broadcast", { event: "bye" }, ({ payload }) => {
      if (channel !== ch || !ID.test(payload?.t)) return;
      r.bye(payload.t, Date.now());
      refresh();
    });

    ch.subscribe(async (status) => {
      if (channel !== ch) return;
      if (status === "SUBSCRIBED") {
        r.hi(tab, myKey, Date.now());
        refresh();
        const where = { c: myPlace.city ?? undefined, cc: myPlace.country ?? undefined };
        void ch.send({ type: "broadcast", event: "hi", payload: { t: tab, b: myKey, ...where } });
        await ch.track({ t: tab, ...where });
        sendPosition(true);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        // Not sure any more: say nothing until it reconnects (it retries by itself).
        emit(null);
      }
    });
  } catch {
    emit(null);
  } finally {
    joining = false;
  }
}

function leave() {
  const ch = channel;
  channel = null;
  roster = null;
  if (posTimer) clearTimeout(posTimer);
  posTimer = null;
  positions.clear();
  if (others.length) {
    others = [];
    otherSubs.forEach((f) => f());
  }
  if (tick) clearTimeout(tick);
  tick = null;
  if (!ch) return;
  try {
    sessionStorage.setItem("here-tab", tab);
  } catch {
    /* ignore */
  }
  // The goodbye goes out ahead of the socket closing, so others see it at once.
  void ch.send({ type: "broadcast", event: "bye", payload: { t: tab } }).catch(() => {});
  void ch.untrack().catch(() => {});
  void client?.removeChannel(ch);
  client?.disconnect();
}

function onVisibility() {
  if (document.visibilityState === "visible") {
    if (awayTimer) clearTimeout(awayTimer);
    awayTimer = null;
    void join();
  } else {
    awayTimer ??= setTimeout(() => {
      awayTimer = null;
      leave();
    }, AWAY_AFTER);
  }
}
// Closing the tab or navigating off the site leaves straight away; coming
// back from the back-forward cache rejoins.
const onHide = () => leave();
const onShow = (e: PageTransitionEvent) => e.persisted && void join();
const onOnline = () => {
  forgetDevice();
  if (document.visibilityState === "visible") void join();
};

function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1) {
    if (document.visibilityState === "visible") void join();
    else onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("online", onOnline);
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  return () => {
    subs.delete(f);
    if (!subs.size) {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("scroll", onScroll);
      if (awayTimer) clearTimeout(awayTimer);
      awayTimer = null;
      leave();
    }
  };
}

/** People on the site right now, or null while it isn't sure. */
export function useHere(): Here | null {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );
}

/** A new page means a new position. */
export function pageChanged() {
  sendPosition(true);
}

function subscribeOthers(f: () => void) {
  otherSubs.add(f);
  const off = subscribe(() => {});
  return () => {
    otherSubs.delete(f);
    off();
  };
}

/** The other people on the site right now, with their town and where they are. */
export function useOthers(): Other[] {
  return useSyncExternalStore(subscribeOthers, () => others, () => EMPTY);
}
const EMPTY: Other[] = [];

/** My own town, once the server has said. */
export const myTown = (): Place => myPlace;

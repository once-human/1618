"use client";

import { useSyncExternalStore } from "react";
import type { RealtimeChannel, RealtimeClient } from "@supabase/realtime-js";
import { HERE_KEY as KEY, HERE_URL as URL } from "./here-config";
import { Roster, type Here } from "./roster";

export type { Here };

/**
 * Who's on the site right now, live.
 *
 * Every open tab joins one shared channel on Supabase Realtime. A person is a
 * browser: it keeps one random id in local storage, so all its tabs count
 * once, while a private window or another device counts as someone else.
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

/** Publish the count, and wake up again when a grace period runs out. */
function refresh() {
  if (!roster || !channel) return;
  const now = Date.now();
  emit(roster.count(now));
  if (tick) clearTimeout(tick);
  const next = roster.nextChange(now);
  tick = next == null ? null : setTimeout(refresh, Math.max(16, next - now + 5));
}

async function join() {
  if (channel || joining) return;
  joining = true;
  try {
    const { RealtimeClient } = await import("@supabase/realtime-js");
    client ??= new RealtimeClient(`${URL}/realtime/v1`, {
      params: { apikey: KEY },
      heartbeatIntervalMs: 15_000,
      // Heartbeats run in a worker, so a background tab's throttled timers
      // don't get it mistaken for gone.
      worker: true,
    });
    const me = browserId();
    tab = tabId();
    const r = new Roster(me);
    const ch = client.channel(TOPIC, {
      config: { presence: { key: me }, broadcast: { self: false } },
    });
    channel = ch;
    roster = r;

    ch.on("presence", { event: "sync" }, () => {
      if (channel !== ch) return;
      const all = ch.presenceState<{ t?: string }>();
      const view: Record<string, string[]> = {};
      for (const b in all)
        view[b] = all[b].map((m) => (typeof m.t === "string" ? m.t : m.presence_ref));
      r.sync(view, Date.now());
      refresh();
    });
    ch.on("broadcast", { event: "hi" }, ({ payload }) => {
      if (channel !== ch || !ID.test(payload?.t) || !ID.test(payload?.b)) return;
      r.hi(payload.t, payload.b, Date.now());
      refresh();
    });
    ch.on("broadcast", { event: "bye" }, ({ payload }) => {
      if (channel !== ch || !ID.test(payload?.t)) return;
      r.bye(payload.t, Date.now());
      refresh();
    });

    ch.subscribe(async (status) => {
      if (channel !== ch) return;
      if (status === "SUBSCRIBED") {
        r.hi(tab, me, Date.now());
        refresh();
        void ch.send({ type: "broadcast", event: "hi", payload: { t: tab, b: me } });
        await ch.track({ t: tab });
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
const onOnline = () => document.visibilityState === "visible" && void join();

function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1) {
    if (document.visibilityState === "visible") void join();
    else onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("online", onOnline);
  }
  return () => {
    subs.delete(f);
    if (!subs.size) {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("online", onOnline);
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

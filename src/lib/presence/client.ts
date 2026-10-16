"use client";

import { useSyncExternalStore } from "react";
import type { Music, Presence, Saved } from "./types";

/**
 * A shared poller: every component reading the same endpoint subscribes to one
 * store, so there's only ever one request in flight. It refreshes on an
 * interval while the tab is visible, and immediately when you come back to it.
 */
function createPoller<T>(url: string, everyMs: number, onData?: (d: T) => void) {
  let data: T | null = null;
  const subs = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;

  async function load() {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      data = (await res.json()) as T;
      onData?.(data);
      subs.forEach((f) => f());
    } catch {
      /* offline or blocked: keep whatever we had */
    }
  }

  const onVisible = () => document.visibilityState === "visible" && void load();

  function subscribe(f: () => void) {
    subs.add(f);
    if (!timer) {
      void load();
      timer = setInterval(() => document.visibilityState === "visible" && void load(), everyMs);
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      subs.delete(f);
      if (!subs.size && timer) {
        clearInterval(timer);
        timer = null;
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }

  return { subscribe, get: () => data };
}

const presence = createPoller<Presence>("/api/presence", 60_000);

// Music changes song by song, so it refreshes much more often. New covers are
// fetched straight away, so they're ready before anyone scrolls to them.
const music = createPoller<Music>("/api/music", 15_000, (d) => {
  d.tracks?.forEach((t) => {
    if (t.image) new Image().src = t.image;
  });
});

// Pins change rarely; checking every five minutes is plenty.
const saved = createPoller<Saved>("/api/saved", 5 * 60_000);

export function useSaved(): Saved | null {
  return useSyncExternalStore(saved.subscribe, saved.get, () => null);
}

export function usePresence(): Presence | null {
  return useSyncExternalStore(presence.subscribe, presence.get, () => null);
}

export function useMusic(): Music | null {
  return useSyncExternalStore(music.subscribe, music.get, () => null);
}

/* A shared clock that ticks every 20s, so every "4m ago" stays honest. */
let now = 0;
const tickSubs = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function subscribeNow(f: () => void) {
  tickSubs.add(f);
  if (!tickTimer) {
    now = Date.now();
    tickTimer = setInterval(() => {
      now = Date.now();
      tickSubs.forEach((g) => g());
    }, 20_000);
  }
  return () => {
    tickSubs.delete(f);
    if (!tickSubs.size && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

/** Current time in ms on the client; 0 during server render (renders nothing time-based). */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeNow,
    () => now || Date.now(),
    () => 0,
  );
}

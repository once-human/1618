"use client";

import { useSyncExternalStore } from "react";
import type { Presence } from "./types";

/**
 * One shared poller for the whole page: every component that reads presence
 * subscribes to the same store, so there is only ever one request in flight.
 */
let data: Presence | null = null;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
  try {
    const res = await fetch("/api/presence", { cache: "no-store" });
    if (!res.ok) return;
    data = (await res.json()) as Presence;
    subs.forEach((f) => f());
  } catch {
    /* offline or blocked: keep whatever we had */
  }
}

function subscribe(f: () => void) {
  subs.add(f);
  if (!timer) {
    void load();
    timer = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
  }
  return () => {
    subs.delete(f);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function usePresence(): Presence | null {
  return useSyncExternalStore(
    subscribe,
    () => data,
    () => null,
  );
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

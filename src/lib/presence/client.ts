"use client";

import type { Burst, PastSleep } from "@/lib/presence/sleep";
import type { Live as DeskLive } from "@/lib/desk/model";
import type { DeskDays } from "@/lib/desk/server";
import { useEffect, useSyncExternalStore } from "react";
import type { ListeningStats, Live, Music, Presence, Saved, Submission, TodayEvent } from "./types";
import type { Replay, RangeSummary } from "@/lib/history/query";
import { artSet } from "@/lib/art";
import { isBotBrowser, whenHuman } from "@/lib/bots";

/**
 * Shared pollers: every component reading the same endpoint subscribes to one
 * store, so there's only ever one request in flight. Each refreshes on an
 * interval while the tab is visible, and straight away when you come back.
 */
function createPoller<T>(
  url: string | (() => string),
  everyMs: number,
  opts: { etag?: boolean; onData?: (d: T) => void } = {},
) {
  let data: T | null = null;
  let primedAt = 0;
  let etag: string | null = null;
  const subs = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let inflight = false;

  async function load() {
    if (inflight) return;
    inflight = true;
    try {
      const res = await fetch(typeof url === "function" ? url() : url, {
        cache: "no-store",
        headers: opts.etag && etag ? { "If-None-Match": etag } : undefined,
      });
      if (res.status === 304 || !res.ok) return;
      etag = res.headers.get("etag");
      data = (await res.json()) as T;
      opts.onData?.(data);
      subs.forEach((f) => f());
    } catch {
      /* offline or blocked: keep whatever we had */
    } finally {
      inflight = false;
    }
  }

  const onVisible = () => document.visibilityState === "visible" && void load();

  function subscribe(f: () => void) {
    subs.add(f);
    if (!timer) {
      // Data sent with the page is fresh: the first poll can wait for the interval.
      if (Date.now() - primedAt > 10_000) void load();
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

  return {
    subscribe,
    get: () => data,
    refresh: load,
    set: (d: T) => ((data = d), subs.forEach((f) => f())),
    /** Data the server sent with the page: used straight away, no request. */
    prime: (d: T) => {
      if (data !== null) return false;
      data = d;
      primedAt = Date.now();
      opts.onData?.(d);
      return true;
    },
    notify: () => subs.forEach((f) => f()),
  };
}

const usePoller = <T>(p: ReturnType<typeof createPoller<T>>): T | null =>
  useSyncExternalStore(p.subscribe, p.get, () => null);

/* ---- Pinterest: fetched once, then only when the live stamp says it changed ---- */

let savedVersion: string | null = null;
const saved = createPoller<Saved>("/api/saved", 10 * 60_000);

/* ---- Everything live in one poll: presence + music (+ Pinterest's version stamp) ---- */

const live = createPoller<Live>("/api/live", 15_000, {
  etag: true,
  onData: (d) => {
    // New covers are fetched straight away (at the size this screen will use),
    // so they're ready before anyone scrolls to them.
    d.music.tracks?.forEach((t) => {
      if (!t.image) return;
      const img = new Image();
      const set = artSet(t.image, 48);
      if (set.srcSet) img.srcset = set.srcSet;
      img.src = set.src ?? t.image;
    });
    if (d.savedVersion && savedVersion && d.savedVersion !== savedVersion) void saved.refresh();
    savedVersion = d.savedVersion;
  },
});

const select = <T>(pick: (l: Live) => T) => {
  let last: Live | null = null;
  let value: T | null = null;
  return () => {
    const l = live.get();
    if (l !== last) {
      last = l;
      value = l ? pick(l) : null;
    }
    return value;
  };
};
const getPresence = select((l) => l.presence);
const getMusic = select((l) => l.music);

export function usePresence(): Presence | null {
  return useSyncExternalStore(live.subscribe, getPresence, () => null);
}
export function useMusic(): Music | null {
  return useSyncExternalStore(live.subscribe, getMusic, () => null);
}
export const useSaved = () => usePoller(saved);

/* ---- The laptop: its own quick poll, the newest sample the agent sent ---- */

const desk = createPoller<DeskLive>("/api/desk", 10_000);
export const useDesk = () => usePoller(desk);
const deskDays = createPoller<DeskDays>("/api/desk/days", 2 * 60_000);
const sleepIn = createPoller<{ bursts: Burst[]; past: PastSleep[] }>("/api/sleep", 2 * 60_000);
export const useSleepInputs = () => usePoller(sleepIn);
export const useDeskDays = () => usePoller(deskDays);

/* ---- Slower things ---- */

const listening = createPoller<ListeningStats>("/api/listening", 10 * 60_000);
const timeline = createPoller<{ hours: number; events: TodayEvent[] }>("/api/timeline", 2 * 60_000);
const replay = createPoller<Replay>("/api/replay", 30 * 60_000);
const songs = createPoller<Submission[]>("/api/submissions?kind=song", 60_000);
const notes = createPoller<Submission[]>("/api/submissions?kind=note", 60_000);

export const useListening = () => usePoller(listening);
export const useTimeline = () => usePoller(timeline);
export const useReplay = () => usePoller(replay);
export const useSongsSent = () => usePoller(songs);
export const useGuestbook = () => usePoller(notes);

/**
 * Data the server sent along with the page, so it shows the moment the page
 * starts instead of after a round trip. Called by <Seed>, browser only.
 */
export interface SeedData {
  live?: Live | null;
  saved?: Saved | null;
  listening?: ListeningStats | null;
  timeline?: { hours: number; events: TodayEvent[] } | null;
  replay?: Replay | null;
}
const seedable = { live, saved, listening, timeline, replay } as const;
export function seedStores(d: SeedData): (() => void)[] {
  const primed: (() => void)[] = [];
  for (const [k, store] of Object.entries(seedable) as [keyof SeedData, (typeof seedable)[keyof SeedData]][]) {
    const v = d[k];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each store takes its own shape
    if (v && (store as any).prime(v)) primed.push(store.notify);
  }
  return primed;
}

/** Put a just-sent post at the top straight away, without waiting for the next poll. */
export function addSubmission(s: Submission) {
  const store = s.kind === "song" ? songs : notes;
  store.set([s, ...(store.get() ?? [])]);
}

/** One range from the history store, fetched on demand. */
export async function fetchHistory(
  query: string,
): Promise<(RangeSummary & { label: string }) | null> {
  try {
    const res = await fetch(`/api/history?${query}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/* ---- People here right now: see ./here.ts ---- */

export { useHere, type Here } from "./here";

/* ---- Visitors so far: each person once a day ---- */

let visits: number | null = null;
let counted = false;
const visitSubs = new Set<() => void>();

export function useVisits(): number | null {
  useEffect(() => {
    if (counted || isBotBrowser()) return;
    counted = true;
    // Counted on the first thing a person does, so crawlers that run the page aren't.
    void whenHuman().then(() => fetch("/api/visit", { method: "POST" }))
      .then((r) => r?.json())
      .then((d: { visits: number | null } | undefined) => {
        if (!d) return;
        visits = d.visits;
        visitSubs.forEach((f) => f());
      })
      .catch(() => {});
  }, []);
  return useSyncExternalStore(
    (f) => (visitSubs.add(f), () => visitSubs.delete(f)),
    () => visits,
    () => null,
  );
}

/* ---- 30-second previews: one shared player, so only one clip plays at a time ---- */

interface PlayerState {
  key: string | null;
  playing: boolean;
  progress: number;
}
let player: HTMLAudioElement | null = null;
let pstate: PlayerState = { key: null, playing: false, progress: 0 };
const playerSubs = new Set<() => void>();
const emit = (s: Partial<PlayerState>) => {
  pstate = { ...pstate, ...s };
  playerSubs.forEach((f) => f());
};

export function togglePreview(key: string, url: string) {
  if (!player) {
    player = new Audio();
    player.preload = "none";
    player.addEventListener(
      "timeupdate",
      () =>
        player && emit({ progress: player.duration ? player.currentTime / player.duration : 0 }),
    );
    player.addEventListener("ended", () => emit({ playing: false, progress: 0, key: null }));
    player.addEventListener("pause", () => emit({ playing: false }));
    player.addEventListener("play", () => emit({ playing: true }));
  }
  if (pstate.key === key) {
    if (player.paused) void player.play().catch(() => {});
    else player.pause();
    return;
  }
  player.src = url;
  player.volume = 0.8;
  emit({ key, progress: 0 });
  void player.play().catch(() => emit({ playing: false }));
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    (f) => (playerSubs.add(f), () => playerSubs.delete(f)),
    () => pstate,
    () => pstate,
  );
}

/* ---- A shared clock that ticks every 20s, so every "4m ago" stays honest ---- */

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

/** A faster clock (every second) for progress bars; only runs while something uses it. */
let fast = 0;
const fastSubs = new Set<() => void>();
let fastTimer: ReturnType<typeof setInterval> | null = null;
export function useSecond(active: boolean): number {
  return useSyncExternalStore(
    (f) => {
      if (!active) return () => {};
      fastSubs.add(f);
      if (!fastTimer) {
        fast = Date.now();
        fastTimer = setInterval(() => {
          fast = Date.now();
          fastSubs.forEach((g) => g());
        }, 1000);
      }
      return () => {
        fastSubs.delete(f);
        if (!fastSubs.size && fastTimer) {
          clearInterval(fastTimer);
          fastTimer = null;
        }
      };
    },
    () => (active ? fast || Date.now() : 0),
    () => 0,
  );
}

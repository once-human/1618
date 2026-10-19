"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { RealtimeChannel, RealtimeClient } from "@supabase/realtime-js";
import { HERE_KEY, HERE_URL } from "@/lib/presence/here-config";
import type { SourceCheck } from "@/lib/history/sources";
import type { Bedtime } from "@/lib/presence/types";

/* ---- what /api/admin/state sends ---- */

export interface Thread {
  id: string;
  name: string | null;
  city: string | null;
  country: string | null;
  page: string | null;
  via: string | null;
  blocked: boolean;
  createdAt: string;
  lastAt: string;
  count: number;
  /** When I last looked at it in /admin (or answered it from Telegram). */
  readAt: string | null;
  anon: boolean;
  /** "iPhone, Safari" */
  device: string | null;
  /** A short one-way code for the network it came from (same code = same network). */
  network: string | null;
  /** Other chats from the same network. */
  siblings: number;
  last: { side: "visitor" | "me"; text: string; at: string } | null;
}

export const who = (t: Thread) => t.name || (t.anon ? "Anonymous" : "No name yet");

/** Waiting on me: they wrote last, and I haven't looked since. */
export const isNew = (t: Thread) => t.last?.side === "visitor" && !t.blocked && (!t.readAt || t.readAt < t.last.at);
export interface Post {
  id: number;
  kind: "song" | "note";
  name: string | null;
  message: string | null;
  song: { track?: string; artist?: string; art?: string | null; link?: string; preview?: string | null } | null;
  hidden: boolean;
  at: string;
  played: { count: number; last: string } | null;
}
export interface HealthDay {
  day: string;
  steps?: number;
  distanceKm?: number;
  activeKcal?: number;
  sleepHours?: number;
  at: string;
}
export interface RecentPlace {
  city: string;
  country: string | null;
  lat: number;
  lon: number;
  tz: string;
}
export interface AdminState {
  at: string;
  place: { city: string; tz: string; lat: number; lon: number; setAt?: string; held: { until: number | null; setAt: string } | null; recent: RecentPlace[] };
  weather: { tempC: number; label: string; cloud?: number | null; rain?: boolean } | null;
  status: { text: string; setAt: string; until: string } | null;
  bedtime: {
    shown: Bedtime | null;
    window: Bedtime | null;
    nights: { at: string; via: string | null; endedAt: string | null }[];
  };
  github: { repo: string; url: string; action: string; message?: string | null; at: string } | null;
  music: { track: string; artist: string; at?: string | null; nowPlaying?: boolean; url?: string; art?: string | null }[] | null;
  health: HealthDay[];
  visitors: { day: string; people: number; total: number | null; places: { city: string | null; country: string | null; lat: number | null; lon: number | null; n: number }[] };
  talk: { telegram: { configured: boolean; owner: { name: string } | null }; threads: Thread[] };
  posts: Post[];
  sources: { checks: SourceCheck[]; checkedAt: string };
  store: { plays: number; first: string | null; pins: number; events: number; plays_today: number; lastSync: string | null; backfillDone: boolean } | null;
  shortcuts: Record<"health" | "location" | "status" | "goodnight", boolean>;
  logins: { at: string; city: string | null; country: string | null; device: string }[];
}

/* ---- the store: one fetch, refreshed every 15s while the page is visible ---- */

let data: AdminState | null = null;
let fetchedAt = 0;
let failed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export async function refresh() {
  try {
    const res = await fetch("/api/admin/state", { cache: "no-store" });
    if (res.status === 401) return location.reload(); // logged out elsewhere: back to the door
    data = (await res.json()) as AdminState;
    fetchedAt = Date.now();
    failed = false;
  } catch {
    failed = true;
  }
  emit();
}

let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1) {
    void refresh();
    timer = setInterval(() => document.visibilityState === "visible" && void refresh(), 15_000);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    subs.delete(f);
    if (!subs.size) {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}
const onVisible = () => document.visibilityState === "visible" && Date.now() - fetchedAt > 5000 && void refresh();

let snap: { data: AdminState | null; fetchedAt: number; failed: boolean } = { data, fetchedAt, failed };
export function useAdmin() {
  return useSyncExternalStore(
    subscribe,
    () => (snap.data === data && snap.fetchedAt === fetchedAt && snap.failed === failed ? snap : (snap = { data, fetchedAt, failed })),
    () => snap,
  );
}

/* ---- toasts ---- */

export interface Toast {
  id: number;
  text: string;
  bad?: boolean;
}
let toasts: Toast[] = [];
const toastSubs = new Set<() => void>();
export function toast(text: string, bad = false) {
  const t = { id: Date.now() + Math.random(), text, bad };
  toasts = [...toasts, t].slice(-3);
  toastSubs.forEach((f) => f());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastSubs.forEach((f) => f());
  }, bad ? 5000 : 2600);
}
export const useToasts = () =>
  useSyncExternalStore(
    (f) => (toastSubs.add(f), () => toastSubs.delete(f)),
    () => toasts,
    () => toasts,
  );

/* ---- doing things ---- */

export async function act<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}, done?: string): Promise<(T & { ok: true }) | null> {
  try {
    const res = await fetch("/api/admin/do", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    if (res.status === 401) {
      location.reload();
      return null;
    }
    const d = (await res.json()) as { ok: boolean; reason?: string } & T;
    if (!d.ok) {
      toast(d.reason ?? "That didn't work.", true);
      return null;
    }
    if (done) toast(done);
    void refresh();
    return d as T & { ok: true };
  } catch {
    toast("Couldn't reach the site. Check your connection.", true);
    return null;
  }
}

/* ---- who's on the site right now (watching, not joining: I'm not counted) ---- */

export interface Person {
  key: string;
  city: string | null;
  country: string | null;
  pages: string[];
  tabs: number;
}
let people: Person[] | null = null;
const peopleSubs = new Set<() => void>();
let client: RealtimeClient | null = null;
let channel: RealtimeChannel | null = null;

async function watch() {
  const { RealtimeClient } = await import("@supabase/realtime-js");
  client ??= new RealtimeClient(`${HERE_URL}/realtime/v1`, { params: { apikey: HERE_KEY }, worker: true });
  channel = client.channel("here");
  channel.on("presence", { event: "sync" }, () => {
    const all = channel!.presenceState<{ t?: string; c?: string; cc?: string; p?: string }>();
    people = Object.entries(all)
      .map(([key, metas]) => ({
        key,
        city: metas.find((m) => m.c)?.c ?? null,
        country: metas.find((m) => m.cc)?.cc ?? null,
        pages: [...new Set(metas.map((m) => m.p).filter((p): p is string => typeof p === "string"))],
        tabs: metas.length,
      }))
      .sort((a, b) => (a.city ?? "~").localeCompare(b.city ?? "~"));
    peopleSubs.forEach((f) => f());
  });
  channel.subscribe();
}
export function usePeople(): Person[] | null {
  useEffect(() => {
    if (!channel) void watch();
  }, []);
  return useSyncExternalStore(
    (f) => (peopleSubs.add(f), () => peopleSubs.delete(f)),
    () => people,
    () => null,
  );
}

"use client";

import { useSyncExternalStore } from "react";
import type { RealtimeChannel, RealtimeClient } from "@supabase/realtime-js";
import { HERE_KEY, HERE_URL } from "@/lib/presence/here-config";

/**
 * The visitor's side of "talk to me": one conversation per browser, kept
 * live on every page. My replies arrive over a realtime channel only this
 * browser knows the name of; a slow poll covers the moments it's offline.
 */
export interface TalkMessage {
  id: number;
  side: "visitor" | "me";
  text: string;
  at: string;
}

export interface TalkState {
  /** True when messages reach my phone right away (Telegram); otherwise they wait for me. */
  live: boolean | null;
  thread: string | null;
  messages: TalkMessage[];
  /** Replies from me the visitor hasn't looked at yet. */
  unread: number;
}

let state: TalkState = { live: null, thread: null, messages: [], unread: 0 };
const subs = new Set<() => void>();
const set = (patch: Partial<TalkState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};

const THREAD = /^[a-f0-9]{32}$/;
const stored = () => {
  try {
    const t = localStorage.getItem("talk-thread");
    return t && THREAD.test(t) ? t : null;
  } catch {
    return null;
  }
};

// How many of my replies this browser has actually looked at, kept across
// visits so a reply that came while they were away still shows up as new.
const readSeen = () => {
  try {
    const n = Number(localStorage.getItem("talk-seen"));
    return Number.isFinite(n) && localStorage.getItem("talk-seen") !== null ? n : null;
  } catch {
    return null;
  }
};
const saveSeen = (n: number) => {
  try {
    localStorage.setItem("talk-seen", String(n));
  } catch {
    /* fine */
  }
};
let seen = 0;
let looking = false;
function add(list: TalkMessage[]) {
  const ids = new Set(state.messages.map((m) => m.id));
  const fresh = list.filter((m) => !ids.has(m.id));
  if (!fresh.length) return;
  const messages = [...state.messages, ...fresh].sort((a, b) => a.id - b.id);
  const replies = messages.filter((m) => m.side === "me").length;
  if (looking) {
    seen = replies;
    saveSeen(seen);
  }
  set({ messages, unread: Math.max(0, replies - seen) });
}

/** Called by the conversation view while it's on screen. */
export function markRead(on: boolean) {
  looking = on;
  if (on) {
    seen = state.messages.filter((m) => m.side === "me").length;
    saveSeen(seen);
    if (state.unread) set({ unread: 0 });
  }
}

async function load() {
  const thread = stored();
  const after = state.messages.at(-1)?.id ?? 0;
  try {
    const res = await fetch(`/api/talk?${thread ? `thread=${thread}&after=${after}` : ""}`, { cache: "no-store" });
    const d = (await res.json()) as { live: boolean; messages: TalkMessage[] };
    if (state.thread !== thread) set({ thread });
    set({ live: d.live });
    if (!after) seen = readSeen() ?? d.messages.filter((m) => m.side === "me").length;
    add(d.messages);
  } catch {
    if (state.live === null) set({ live: false });
  }
}

let client: RealtimeClient | null = null;
let channel: RealtimeChannel | null = null;
async function listen() {
  const thread = state.thread;
  if (!thread || channel?.topic === `realtime:talk:${thread}`) return;
  const { RealtimeClient } = await import("@supabase/realtime-js");
  client ??= new RealtimeClient(`${HERE_URL}/realtime/v1`, { params: { apikey: HERE_KEY }, worker: true });
  if (channel) void client.removeChannel(channel);
  channel = client.channel(`talk:${thread}`);
  channel.on("broadcast", { event: "message" }, ({ payload }) => {
    if (payload && typeof payload.id === "number" && typeof payload.text === "string") add([payload as TalkMessage]);
  });
  // Coming back online, catch up on anything missed.
  channel.subscribe((s) => s === "SUBSCRIBED" && void load());
}

export async function sendTalk(text: string, name: string): Promise<{ ok: boolean; reason?: string; delivered?: boolean; live?: boolean }> {
  try {
    const res = await fetch("/api/talk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread: state.thread, text, name, page: location.pathname }),
    });
    const d = (await res.json()) as { ok: boolean; reason?: string; thread?: string; delivered?: boolean; live?: boolean; message?: TalkMessage };
    if (!d.ok) return { ok: false, reason: d.reason };
    if (d.thread && d.thread !== state.thread) {
      try {
        localStorage.setItem("talk-thread", d.thread);
        window.dispatchEvent(new Event("talk-thread"));
      } catch {
        /* this tab only, then */
      }
      set({ thread: d.thread });
      void listen();
    }
    if (d.message) add([d.message]);
    return { ok: true, delivered: d.delivered, live: d.live };
  } catch {
    return { ok: false, reason: "that didn't go through. try again?" };
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1) {
    void load().then(listen);
    // A slow safety net; the live channel does the real work.
    timer = setInterval(() => document.visibilityState === "visible" && state.thread && void load(), 20_000);
  }
  return () => {
    subs.delete(f);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useTalk(): TalkState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

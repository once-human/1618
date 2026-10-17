"use client";

import { useSyncExternalStore } from "react";
import type { RealtimeChannel, RealtimeClient } from "@supabase/realtime-js";
import { HERE_KEY, HERE_URL } from "@/lib/presence/here-config";

/**
 * The visitor's side of "talk to me": one chat per browser, under one name.
 * The chat is kept in this browser (localStorage) by its code, and can be
 * opened on another device with a link. A new name means a fresh chat: the
 * old one is deleted. My replies arrive over a realtime channel; a slow poll
 * covers the moments it's offline.
 */
export interface TalkMessage {
  id: number;
  side: "visitor" | "me";
  text: string;
  at: string;
  /** Only on this browser's own messages while they're on their way. */
  pending?: boolean;
}

export interface Chat {
  id: string;
  name: string | null;
  messages: TalkMessage[];
  /** How many of my replies have been looked at. */
  seen: number;
}

export interface TalkState {
  /** True when messages reach my phone right away (Telegram); otherwise they wait for me on the site. */
  live: boolean | null;
  ready: boolean;
  chat: Chat | null;
  /** The name for a chat that hasn't started yet. */
  name: string;
  unread: number;
}

const KEY = "talk-v3";
const THREAD = /^[a-f0-9]{32}$/;

let state: TalkState = { live: null, ready: false, chat: null, name: "", unread: 0 };
const subs = new Set<() => void>();
const replies = (c: Chat | null) => (c ? c.messages.filter((m) => m.side === "me").length : 0);

function set(patch: Partial<TalkState>) {
  const next = { ...state, ...patch };
  next.unread = next.chat ? Math.max(0, replies(next.chat) - next.chat.seen) : 0;
  state = next;
  save();
  subs.forEach((f) => f());
}

function save() {
  try {
    const c = state.chat;
    localStorage.setItem(KEY, JSON.stringify({ chat: c ? { id: c.id, name: c.name, seen: c.seen } : null, name: state.name }));
    window.dispatchEvent(new Event("talk-thread"));
  } catch {
    /* private mode: this tab only */
  }
}

function restore(): Pick<TalkState, "chat" | "name"> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as { chat?: { id: string; name: string | null; seen: number } | null; name?: string };
      return { chat: d.chat && THREAD.test(d.chat.id) ? { ...d.chat, messages: [] } : null, name: d.name ?? "" };
    }
    // From when a browser could keep several chats: keep the most recent one.
    const v2 = localStorage.getItem("talk-v2");
    if (v2) {
      const d = JSON.parse(v2) as { chats?: { id: string; name: string | null; seen: number }[]; active?: string | null; name?: string };
      const c = d.chats?.find((x) => x.id === d.active) ?? d.chats?.[0];
      return { chat: c && THREAD.test(c.id) ? { id: c.id, name: c.name, seen: c.seen ?? 0, messages: [] } : null, name: d.name ?? "" };
    }
    // From the very first version.
    const old = localStorage.getItem("talk-thread");
    if (old && THREAD.test(old)) return { chat: { id: old, name: null, seen: Number(localStorage.getItem("talk-seen")) || 0, messages: [] }, name: "" };
  } catch {
    /* nothing kept */
  }
  return { chat: null, name: "" };
}

/** Is there a chat to keep a line open for? (Used by the notice on other pages.) */
export function hasChat(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return !!(JSON.parse(raw) as { chat?: unknown }).chat;
    return !!localStorage.getItem("talk-v2") || !!localStorage.getItem("talk-thread");
  } catch {
    return false;
  }
}

/* ---- reading ---- */

let looking = false;
function merge(list: TalkMessage[], name?: string | null) {
  const c = state.chat;
  if (!c) return;
  const known = new Set(c.messages.filter((m) => !m.pending).map((m) => m.id));
  const fresh = list.filter((m) => !known.has(m.id));
  if (!fresh.length && (name === undefined || name === c.name)) return;
  const messages = [...c.messages.filter((m) => !m.pending), ...fresh].sort((a, b) => a.id - b.id).concat(c.messages.filter((m) => m.pending));
  const next = { ...c, messages, name: name === undefined ? c.name : name };
  if (looking) next.seen = replies(next);
  set({ chat: next });
}

function forget() {
  stopListening();
  set({ chat: null });
}

async function load() {
  const c = state.chat;
  const after = c?.messages.filter((m) => !m.pending).at(-1)?.id ?? 0;
  try {
    const res = await fetch(`/api/talk${c ? `?t=${c.id}:${after}` : ""}`, { cache: "no-store" });
    const d = (await res.json()) as { live: boolean; threads: Record<string, { exists: boolean; name: string | null; messages: TalkMessage[] }> };
    const t = c ? d.threads?.[c.id] : undefined;
    if (c && t && !t.exists) forget(); // deleted elsewhere (another device, or by me)
    else if (t) merge(t.messages, t.name);
    const first = !state.ready;
    set({ live: d.live, ready: true });
    if (first) void listen();
  } catch {
    set({ live: state.live ?? false, ready: true });
  }
}

/* ---- live ---- */

let client: RealtimeClient | null = null;
let channel: RealtimeChannel | null = null;
function stopListening() {
  if (channel && client) void client.removeChannel(channel);
  channel = null;
}
async function listen() {
  const id = state.chat?.id;
  if (!id) return stopListening();
  if (channel?.topic === `realtime:talk:${id}`) return;
  stopListening();
  const { RealtimeClient } = await import("@supabase/realtime-js");
  client ??= new RealtimeClient(`${HERE_URL}/realtime/v1`, { params: { apikey: HERE_KEY }, worker: true });
  const ch = client.channel(`talk:${id}`);
  ch.on("broadcast", { event: "message" }, ({ payload }) => {
    if (state.chat?.id === id && payload && typeof payload.id === "number" && typeof payload.text === "string") merge([payload as TalkMessage]);
  });
  ch.on("broadcast", { event: "deleted" }, () => state.chat?.id === id && forget());
  ch.subscribe((s) => s === "SUBSCRIBED" && void load()); // back online: catch up
  channel = ch;
}

/* ---- doing ---- */

type Result = { ok: true; delivered?: boolean; live?: boolean } | { ok: false; reason: string };

/** Write in the chat, or start it (with the name chosen for it). */
export async function send(text: string): Promise<Result> {
  const c = state.chat;
  const temp: TalkMessage = { id: -Date.now(), side: "visitor", text, at: new Date().toISOString(), pending: true };
  if (c) set({ chat: { ...c, messages: [...c.messages, temp] } });
  const dropTemp = () => state.chat && set({ chat: { ...state.chat, messages: state.chat.messages.filter((m) => m.id !== temp.id) } });
  try {
    const res = await fetch("/api/talk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread: c?.id, text, name: c ? undefined : state.name.trim(), page: location.pathname }),
    });
    const d = (await res.json()) as { ok: boolean; reason?: string; thread?: string; delivered?: boolean; live?: boolean; name?: string | null; message?: TalkMessage };
    if (!d.ok || !d.thread || !d.message) {
      if (res.status === 404 && c) forget();
      else dropTemp();
      return { ok: false, reason: d.reason ?? "that didn't go through. try again?" };
    }
    const msg = d.message;
    if (c) set({ chat: { ...c, messages: [...(state.chat?.messages ?? []).filter((m) => m.id !== temp.id), msg] } });
    else {
      set({ chat: { id: d.thread, name: d.name ?? null, messages: [msg], seen: 0 } });
      void listen();
    }
    return { ok: true, delivered: d.delivered, live: d.live };
  } catch {
    dropTemp();
    return { ok: false, reason: "that didn't go through. check your connection?" };
  }
}

/** The name for a chat that hasn't started. */
export const setName = (name: string) => set({ name: name.slice(0, 40) });

async function del(id: string): Promise<Result> {
  try {
    const res = await fetch(`/api/talk?thread=${id}`, { method: "DELETE" });
    const d = (await res.json()) as { ok: boolean; reason?: string };
    return d.ok ? { ok: true } : { ok: false, reason: d.reason ?? "couldn't delete that" };
  } catch {
    return { ok: false, reason: "couldn't reach the site. try again?" };
  }
}

/** Delete the chat for good. */
export async function remove(): Promise<Result> {
  const c = state.chat;
  if (!c) return { ok: true };
  const r = await del(c.id);
  if (r.ok) forget();
  return r;
}

/** A new name is a new chat: the old one is deleted, and the next message starts a fresh one under the new name. */
export async function changeName(name: string): Promise<Result> {
  const r = await remove();
  if (r.ok) set({ name: name.trim().slice(0, 40) });
  return r;
}

/** Open the chat from a link (…/talk#<code>), say from another device. */
export function adopt(id: string): boolean {
  if (!THREAD.test(id)) return false;
  if (state.chat?.id !== id) {
    stopListening();
    set({ chat: { id, name: null, messages: [], seen: 0 } });
  }
  void load().then(listen);
  return true;
}

/** Called by the chat view while it's on screen: my replies count as read. */
export function markRead(on: boolean) {
  looking = on;
  const c = state.chat;
  if (on && c && replies(c) !== c.seen) set({ chat: { ...c, seen: replies(c) } });
}

/* ---- the store ---- */

let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1) {
    if (!state.ready) state = { ...state, ...restore() };
    void load();
    timer = setInterval(() => document.visibilityState === "visible" && state.chat && void load(), 20_000);
  }
  return () => {
    subs.delete(f);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const SERVER: TalkState = { live: null, ready: false, chat: null, name: "", unread: 0 };
export function useTalk(): TalkState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

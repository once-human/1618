"use client";

import { useSyncExternalStore } from "react";
import type { RealtimeChannel, RealtimeClient } from "@supabase/realtime-js";
import { HERE_KEY, HERE_URL } from "@/lib/presence/here-config";

/**
 * The visitor's side of "talk to me". A browser can have several chats, each
 * under whatever name they like; they're kept in this browser (localStorage)
 * by their codes, and can be renamed, deleted, or opened on another device
 * with a link. My replies arrive over a realtime channel per chat; a slow
 * poll covers the moments it's offline.
 */
export interface TalkMessage {
  id: number;
  side: "visitor" | "me";
  text: string;
  at: string;
  /** Only on this browser's own messages while they're on their way. */
  pending?: boolean;
  failed?: string;
}

export interface Chat {
  id: string;
  name: string | null;
  messages: TalkMessage[];
  createdAt: number;
  /** How many of my replies have been looked at. */
  seen: number;
}

export interface TalkState {
  /** True when messages reach my phone right away (Telegram); otherwise they wait for me on the site. */
  live: boolean | null;
  ready: boolean;
  chats: Chat[];
  /** The open chat, or null for a new one being written. */
  active: string | null;
  /** The name to start new chats with (the last one used). */
  name: string;
  unread: number;
}

const KEY = "talk-v2";
const THREAD = /^[a-f0-9]{32}$/;
const MAX_CHATS = 12;

let state: TalkState = { live: null, ready: false, chats: [], active: null, name: "", unread: 0 };
const subs = new Set<() => void>();

const lastAt = (c: Chat) => c.messages.at(-1)?.at ?? new Date(c.createdAt).toISOString();
const replies = (c: Chat) => c.messages.filter((m) => m.side === "me").length;

function set(patch: Partial<TalkState>) {
  const next = { ...state, ...patch };
  next.chats = [...next.chats].sort((a, b) => lastAt(b).localeCompare(lastAt(a)));
  next.unread = next.chats.reduce((n, c) => n + Math.max(0, replies(c) - c.seen), 0);
  state = next;
  save();
  subs.forEach((f) => f());
}

function save() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        chats: state.chats.map(({ id, name, createdAt, seen }) => ({ id, name, createdAt, seen })),
        active: state.active,
        name: state.name,
      }),
    );
    window.dispatchEvent(new Event("talk-thread"));
  } catch {
    /* private mode: this tab only */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as { chats?: Omit<Chat, "messages">[]; active?: string | null; name?: string };
      const chats = (d.chats ?? []).filter((c) => THREAD.test(c.id)).map((c) => ({ ...c, messages: [] }));
      return { chats, active: d.active && chats.some((c) => c.id === d.active) ? d.active : (chats[0]?.id ?? null), name: d.name ?? "" };
    }
    // The single chat kept before there could be several.
    const old = localStorage.getItem("talk-thread");
    if (old && THREAD.test(old)) {
      const seen = Number(localStorage.getItem("talk-seen")) || 0;
      return { chats: [{ id: old, name: null, createdAt: Date.now(), seen, messages: [] }], active: old, name: "" };
    }
  } catch {
    /* nothing kept */
  }
  return { chats: [] as Chat[], active: null, name: "" };
}

/** Is there anything to keep a line open for? (Used by the notice on other pages.) */
export function hasChats(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return ((JSON.parse(raw) as { chats?: unknown[] }).chats?.length ?? 0) > 0;
    return !!localStorage.getItem("talk-thread");
  } catch {
    return false;
  }
}

/* ---- reading ---- */

let looking = false;
function merge(id: string, list: TalkMessage[], name?: string | null) {
  const chats = state.chats.map((c) => {
    if (c.id !== id) return c;
    const known = new Set(c.messages.filter((m) => !m.pending).map((m) => m.id));
    const fresh = list.filter((m) => !known.has(m.id));
    if (!fresh.length && name === undefined) return c;
    const messages = [...c.messages.filter((m) => !m.pending && !m.failed), ...fresh, ...c.messages.filter((m) => m.pending || m.failed)].sort(
      (a, b) => (a.pending || a.failed ? 1 : 0) - (b.pending || b.failed ? 1 : 0) || a.id - b.id,
    );
    const next = { ...c, messages, name: name === undefined ? c.name : name };
    if (looking && state.active === id) next.seen = replies(next);
    return next;
  });
  set({ chats });
}

async function load() {
  const want = state.chats.map((c) => `${c.id}:${c.messages.filter((m) => !m.pending && !m.failed).at(-1)?.id ?? 0}`).join(",");
  try {
    const res = await fetch(`/api/talk${want ? `?t=${want}` : ""}`, { cache: "no-store" });
    const d = (await res.json()) as { live: boolean; threads: Record<string, { exists: boolean; name: string | null; messages: TalkMessage[] }> };
    const first = !state.ready;
    // Chats deleted elsewhere (another device, or by me) drop off the list.
    const gone = Object.entries(d.threads ?? {}).filter(([, t]) => !t.exists).map(([id]) => id);
    gone.forEach(drop);
    for (const [id, t] of Object.entries(d.threads ?? {})) if (t.exists) merge(id, t.messages, t.name);
    set({ live: d.live, ready: true });
    if (first) listen();
  } catch {
    set({ live: state.live ?? false, ready: true });
  }
}

/** Take a chat off the list; if it was open, open the next one. */
function drop(id: string) {
  const rest = state.chats.filter((c) => c.id !== id);
  if (rest.length === state.chats.length) return;
  set({ chats: rest, active: state.active === id ? (rest[0]?.id ?? null) : state.active });
}

/* ---- live ---- */

let client: RealtimeClient | null = null;
const channels = new Map<string, RealtimeChannel>();
async function listen() {
  const ids = new Set(state.chats.map((c) => c.id));
  if (!ids.size && !channels.size) return;
  const { RealtimeClient } = await import("@supabase/realtime-js");
  client ??= new RealtimeClient(`${HERE_URL}/realtime/v1`, { params: { apikey: HERE_KEY }, worker: true });
  for (const [id, ch] of channels) {
    if (ids.has(id)) continue;
    void client.removeChannel(ch);
    channels.delete(id);
  }
  for (const id of ids) {
    if (channels.has(id)) continue;
    const ch = client.channel(`talk:${id}`);
    ch.on("broadcast", { event: "message" }, ({ payload }) => {
      if (payload && typeof payload.id === "number" && typeof payload.text === "string") merge(id, [payload as TalkMessage]);
    });
    ch.on("broadcast", { event: "deleted" }, () => drop(id));
    ch.subscribe((s) => s === "SUBSCRIBED" && void load()); // back online: catch up
    channels.set(id, ch);
  }
}

/* ---- doing ---- */

type Result = { ok: true; delivered?: boolean; live?: boolean } | { ok: false; reason: string };

/** Write in the open chat, or start a new one. */
export async function send(text: string, nameForNew?: string): Promise<Result> {
  const active = state.active;
  const temp: TalkMessage = { id: -Date.now(), side: "visitor", text, at: new Date().toISOString(), pending: true };
  if (active) set({ chats: state.chats.map((c) => (c.id === active ? { ...c, messages: [...c.messages, temp] } : c)) });
  const name = active ? undefined : (nameForNew ?? state.name).trim();
  try {
    const res = await fetch("/api/talk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread: active, text, name, page: location.pathname }),
    });
    const d = (await res.json()) as { ok: boolean; reason?: string; thread?: string; delivered?: boolean; live?: boolean; name?: string | null; message?: TalkMessage };
    if (!d.ok || !d.thread || !d.message) {
      if (res.status === 404 && active) set({ chats: state.chats.filter((c) => c.id !== active), active: null });
      else if (active) set({ chats: state.chats.map((c) => (c.id === active ? { ...c, messages: c.messages.filter((m) => m.id !== temp.id) } : c)) });
      return { ok: false, reason: d.reason ?? "that didn't go through. try again?" };
    }
    const msg = d.message;
    if (active) {
      set({ chats: state.chats.map((c) => (c.id === active ? { ...c, messages: [...c.messages.filter((m) => m.id !== temp.id), msg] } : c)) });
    } else {
      const chat: Chat = { id: d.thread, name: d.name ?? null, messages: [msg], createdAt: Date.now(), seen: 0 };
      set({ chats: [chat, ...state.chats].slice(0, MAX_CHATS), active: d.thread, name: name ?? state.name });
      void listen();
    }
    return { ok: true, delivered: d.delivered, live: d.live };
  } catch {
    if (active) set({ chats: state.chats.map((c) => (c.id === active ? { ...c, messages: c.messages.filter((m) => m.id !== temp.id) } : c)) });
    return { ok: false, reason: "that didn't go through. check your connection?" };
  }
}

export function open(id: string | null) {
  set({ active: id });
  if (id && looking) markRead(true);
}

export const newChat = () => open(null);
export const setName = (name: string) => set({ name: name.slice(0, 40) });

export async function rename(id: string, name: string): Promise<Result> {
  try {
    const res = await fetch("/api/talk", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thread: id, name }) });
    const d = (await res.json()) as { ok: boolean; reason?: string; name?: string | null };
    if (!d.ok) return { ok: false, reason: d.reason ?? "couldn't rename that" };
    set({ chats: state.chats.map((c) => (c.id === id ? { ...c, name: d.name ?? null } : c)), name: d.name ?? state.name });
    return { ok: true };
  } catch {
    return { ok: false, reason: "couldn't reach the site. try again?" };
  }
}

export async function remove(id: string): Promise<Result> {
  try {
    const res = await fetch(`/api/talk?thread=${id}`, { method: "DELETE" });
    const d = (await res.json()) as { ok: boolean; reason?: string };
    if (!d.ok) return { ok: false, reason: d.reason ?? "couldn't delete that" };
  } catch {
    return { ok: false, reason: "couldn't reach the site. try again?" };
  }
  const ch = channels.get(id);
  if (ch && client) void client.removeChannel(ch);
  channels.delete(id);
  drop(id);
  return { ok: true };
}

/** Bring in a chat from a link (…/talk#<code>), say from another device. */
export function adopt(id: string): boolean {
  if (!THREAD.test(id)) return false;
  if (!state.chats.some((c) => c.id === id))
    set({ chats: [{ id, name: null, messages: [], createdAt: Date.now(), seen: 0 }, ...state.chats].slice(0, MAX_CHATS) });
  set({ active: id });
  void load().then(listen);
  return true;
}

/** Called by the chat view while it's on screen: replies in the open chat count as read. */
export function markRead(on: boolean) {
  looking = on;
  if (!on || !state.active) return;
  const c = state.chats.find((x) => x.id === state.active);
  if (c && replies(c) !== c.seen) set({ chats: state.chats.map((x) => (x.id === c.id ? { ...x, seen: replies(x) } : x)) });
}

/* ---- the store ---- */

let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1) {
    if (!state.ready) {
      const r = restore();
      state = { ...state, ...r };
    }
    void load();
    timer = setInterval(() => document.visibilityState === "visible" && state.chats.length && void load(), 20_000);
  }
  return () => {
    subs.delete(f);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const SERVER: TalkState = { live: null, ready: false, chats: [], active: null, name: "", unread: 0 };
export function useTalk(): TalkState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

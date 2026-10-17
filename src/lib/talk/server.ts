import "server-only";
import { randomBytes } from "node:crypto";
import { allow, kvGet, q, visitorKey } from "@/lib/db";
import { geoOf, placeName } from "@/lib/geo";
import { moderate, moderateName } from "@/lib/moderation";
import { owner, push, telegramConfigured, tg } from "./telegram";

/**
 * Talk, the server side, shared by the site (/api/talk) and the terminal
 * (curl …/talk). A conversation is a random 128-bit code: whoever holds it
 * can read, write, rename or delete that one conversation, and nothing else.
 *
 * Keeping it open without letting it become a spam pipe to my phone:
 * - every chat has a name: one chat per browser, under one name; a new name means a new chat
 *   (the old one is deleted). Chats from before names were asked for get to add one, once.
 * - per network: 20 messages / 10 min; 3 new chats an hour and 6 a day (which also caps name changes); 10 deletes an hour
 * - everyone together: 300 messages and 60 new chats an hour reach my phone at most
 * - the same message twice in a row is dropped; bots that fill the hidden field are dropped
 * - words get the same moderation as the guestbook (code is fine here)
 * - I can /block a conversation from Telegram, which also blocks that network for the day
 */
export const THREAD = /^[a-f0-9]{32}$/;
export const MAX_TEXT = 2000;

export interface TalkMessage {
  id: number;
  side: "visitor" | "me";
  text: string;
  at: string;
}

export interface ThreadView {
  exists: boolean;
  name: string | null;
  messages: TalkMessage[];
}

export const isLive = async () => telegramConfigured() && !!(await owner());

type Fail = { ok: false; reason: string; status: number };
const fail = (reason: string, status = 400): Fail => ({ ok: false, reason, status });

const currentNameOf = (rows: { name: string | null }[] | null) => rows?.[0]?.name ?? null;

export async function readThreads(want: { id: string; after: number }[]): Promise<Record<string, ThreadView>> {
  const ids = want.map((w) => w.id).filter((id) => THREAD.test(id)).slice(0, 20);
  if (!ids.length) return {};
  const [threads, msgs] = await Promise.all([
    q<{ id: string; name: string | null }>("talk threads", (db) => db`SELECT id, name FROM talk_threads WHERE id = ANY(${ids})`),
    q<{ id: string; thread: string; side: "visitor" | "me"; text: string; at: string }>("talk read", (db) =>
      db`SELECT id, thread, side, text, at FROM talk_messages WHERE thread = ANY(${ids}) ORDER BY id LIMIT 2000`,
    ),
  ]);
  const out: Record<string, ThreadView> = {};
  if (!threads) return out; // database down: say nothing rather than "deleted"
  for (const id of ids) out[id] = { exists: false, name: null, messages: [] };
  for (const t of threads) out[t.id] = { exists: true, name: t.name, messages: [] };
  const after = new Map(want.map((w) => [w.id, w.after]));
  for (const m of msgs ?? []) {
    if (Number(m.id) <= (after.get(m.thread) ?? 0)) continue;
    out[m.thread]?.messages.push({ id: Number(m.id), side: m.side, text: m.text, at: new Date(m.at).toISOString() });
  }
  return out;
}

async function blocked(who: string, thread: string | null): Promise<boolean> {
  const b = await kvGet<{ until: number }>(`talk-block:${who}`);
  if (b && b.value.until > Date.now()) return true;
  if (!thread) return false;
  const r = await q<{ blocked: boolean }>("talk blocked", (db) => db`SELECT blocked FROM talk_threads WHERE id = ${thread}`);
  return !!r?.[0]?.blocked;
}

export async function postMessage(
  req: Request,
  input: { thread?: unknown; text?: unknown; name?: unknown; page?: unknown; website?: unknown },
  via: "site" | "terminal",
): Promise<Fail | { ok: true; thread: string; isNew: boolean; delivered: boolean; live: boolean; message: TalkMessage; name: string | null }> {
  if (input.website) return fail("thanks!", 200); // the hidden field: only bots fill it

  const text = moderate(typeof input.text === "string" ? input.text : "", { max: MAX_TEXT, links: true, code: true });
  if (!text.ok) return fail(text.reason);
  const nameIn = typeof input.name === "string" ? input.name : null;
  const name = nameIn === null ? null : moderateName(nameIn);
  if (name && !name.ok) return fail(name.reason);
  const given = name?.ok && name.text.trim().length >= 2 ? name.text.trim() : null;

  const who = visitorKey(req);
  let thread = typeof input.thread === "string" && THREAD.test(input.thread) ? input.thread : null;
  const known = thread
    ? await q<{ id: string; name: string | null }>("talk thread", (db) => db`SELECT id, name FROM talk_threads WHERE id = ${thread}`)
    : null;
  if (thread && known && !known.length) return fail("that chat was deleted. start a new one?", 404);
  if (await blocked(who, thread)) return fail("I've closed this chat. Email works if it's important.", 403);
  if (!(await allow(`talk:${who}`, 20, 600))) return fail("easy, one at a time 🙂 give it a minute", 429);

  const isNew = !thread;
  let currentName = known?.[0]?.name ?? null; // fixed once the chat starts
  // Everyone tells me who they are: a chat can't start (or carry on, if it never had one) without a name.
  if (!given && (isNew || !currentNameOf(known))) return fail(via === "terminal" ? "tell me your name: add &name=YourName" : "tell me your name first 🙂", 400);
  if (isNew) {
    if (!(await allow(`talk-new:${who}`, 3, 3600)) || !(await allow(`talk-new-day:${who}`, 6, 86400)))
      return fail("you've started a few chats already. give it a while before starting another?", 429);
    if (!(await allow("talk-new:all", 60, 3600))) return fail("lots of people writing right now. try again in a bit?", 429);
    thread = randomBytes(16).toString("hex");
    const geo = geoOf(req);
    const page = typeof input.page === "string" ? input.page.slice(0, 80) : null;
    currentName = given;
    const made = await q("talk new", (db) =>
      db`INSERT INTO talk_threads (id, city, country, page, name, who, via) VALUES (${thread}, ${geo.city}, ${geo.country}, ${page}, ${currentName}, ${who}, ${via})`,
    );
    if (!made) return fail("something broke on my end. try again?", 500);
  } else {
    // The same thing twice in a row is a double-tap or a loop, not a message.
    const last = await q<{ text: string; at: string }>("talk last", (db) =>
      db`SELECT text, at FROM talk_messages WHERE thread = ${thread} AND side = 'visitor' ORDER BY id DESC LIMIT 1`,
    );
    if (last?.[0]?.text === text.text && Date.now() - Date.parse(last[0].at) < 10 * 60_000) return fail("you just sent that one 🙂");
  }

  const rows = await q<{ id: string; at: string }>("talk write", (db) =>
    db`INSERT INTO talk_messages (thread, side, text) VALUES (${thread}, 'visitor', ${text.text}) RETURNING id, at`,
  );
  if (!rows?.[0]) return fail("something broke on my end. try again?", 500);
  const id = Number(rows[0].id);
  const info = await q<{ city: string | null; country: string | null; page: string | null }>("talk touch", (db) =>
    db`UPDATE talk_threads SET last_at = now() WHERE id = ${thread} RETURNING city, country, page`,
  );

  // A chat from before names were asked for: the name is added (once; after that it's fixed).
  if (!isNew && !currentName && given) {
    await q("talk name", (db) => db`UPDATE talk_threads SET name = ${given} WHERE id = ${thread} AND name IS NULL`);
    currentName = given;
  }

  const me = telegramConfigured() ? await owner() : null;
  let delivered = false;
  if (me && (await allow("talk-phone:all", 300, 3600))) {
    const tag = `#${thread!.slice(0, 4)}`;
    const who_ = currentName || "Someone";
    const where = placeName(info?.[0]?.city, info?.[0]?.country);
    const head = isNew
      ? `💬 New chat ${tag} · ${who_} · ${where}${via === "terminal" ? " · from a terminal" : info?.[0]?.page ? ` · on ${info[0].page}` : ""}\n\n`
      : `💬 ${tag} · ${who_}\n`;
    const sent = await tg<{ message_id: number }>("sendMessage", {
      chat_id: me.chatId,
      text: `${head}${text.text}${isNew ? "\n\n↩️ Swipe-reply to answer · /block to close this chat" : ""}`,
      link_preview_options: { is_disabled: true },
    });
    if (sent) {
      delivered = true;
      await q("talk tg", (db) => db`UPDATE talk_messages SET tg_id = ${sent.message_id} WHERE id = ${id}`);
    }
  }

  return {
    ok: true,
    thread: thread!,
    isNew,
    delivered,
    live: !!me,
    name: currentName,
    message: { id, side: "visitor", text: text.text, at: new Date(rows[0].at).toISOString() },
  };
}

/**
 * Delete a conversation for good: from the store, and from my Telegram too
 * (Telegram only lets a bot remove messages from the last 48 hours).
 */
export async function deleteThread(req: Request, thread: unknown): Promise<Fail | { ok: true }> {
  if (typeof thread !== "string" || !THREAD.test(thread)) return fail("no such chat", 404);
  if (!(await allow(`talk-edit:${visitorKey(req)}`, 10, 3600))) return fail("that's a lot of changes. try later?", 429);
  const msgs = await q<{ tg_id: string | null }>("talk tg ids", (db) => db`SELECT tg_id FROM talk_messages WHERE thread = ${thread} AND tg_id IS NOT NULL`);
  const gone = await q<{ name: string | null }>("talk delete", (db) => db`DELETE FROM talk_threads WHERE id = ${thread} RETURNING name`);
  if (!gone?.length) return { ok: true }; // already gone is fine
  const me = telegramConfigured() ? await owner() : null;
  if (me) {
    const ids = (msgs ?? []).map((m) => Number(m.tg_id)).filter(Boolean);
    for (let i = 0; i < ids.length; i += 100) await tg("deleteMessages", { chat_id: me.chatId, message_ids: ids.slice(i, i + 100) });
    await tg("sendMessage", { chat_id: me.chatId, text: `🗑 #${thread.slice(0, 4)}${gone[0].name ? ` (${gone[0].name})` : ""} deleted their chat.` });
  }
  await push(`talk:${thread}`, "deleted", {});
  return { ok: true };
}

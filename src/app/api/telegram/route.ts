import { connection } from "next/server";
import { kvDelete, kvGet, kvSet, q } from "@/lib/db";
import { placeName } from "@/lib/geo";
import { owner, push, tg, webhookSecret } from "@/lib/talk/telegram";

/**
 * Telegram calls this for every message sent to my bot.
 *
 * - "/start <code>" from the one-time link on /admin makes that chat mine.
 * - From me: a reply to a visitor's message answers that visitor; a plain
 *   message goes to whoever wrote most recently (within half an hour).
 *   "/chats" lists the open conversations.
 * - Anyone else is politely ignored.
 */
type Msg = {
  message_id: number;
  chat: { id: number };
  from?: { first_name?: string };
  text?: string;
  reply_to_message?: { message_id: number };
};

const send = (chat_id: number, text: string, reply_to?: number) =>
  tg("sendMessage", { chat_id, text, ...(reply_to ? { reply_parameters: { message_id: reply_to } } : {}) });

export async function POST(req: Request) {
  await connection();
  if (req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) return new Response("No", { status: 401 });
  let update: { message?: Msg };
  try {
    update = await req.json();
  } catch {
    return new Response("ok");
  }
  const m = update.message;
  if (!m?.chat) return new Response("ok");
  const text = (m.text ?? "").trim();

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    const claim = await kvGet<{ code: string; expires: number }>("telegram:claim");
    if (code && claim && claim.value.code === code && claim.value.expires > Date.now()) {
      await kvSet("telegram:owner", { chatId: m.chat.id, name: m.from?.first_name ?? "" });
      await kvDelete("telegram:claim");
      await send(
        m.chat.id,
        "Connected ✅\n\nWhen someone writes to you on onkaryaglewad.in, it shows up here. Swipe to reply to their message and your answer appears on their screen straight away.\n\nType without replying and it goes to whoever wrote most recently. /chats lists open conversations.",
      );
    } else if (m.chat.id !== (await owner())?.chatId) {
      await send(m.chat.id, "Hi! This bot only passes messages for onkaryaglewad.in. Say hello there 🙂");
    }
    return new Response("ok");
  }

  const me = await owner();
  if (!me || m.chat.id !== me.chatId) return new Response("ok");

  if (text === "/chats") {
    const rows = await q<{ id: string; city: string | null; country: string | null; n: number; last: string }>("talk chats", (db) =>
      db`SELECT t.id, t.city, t.country, count(m.id)::int AS n, t.last_at AS last
         FROM talk_threads t JOIN talk_messages m ON m.thread = t.id
         WHERE t.last_at > now() - interval '1 day' GROUP BY t.id ORDER BY t.last_at DESC LIMIT 10`,
    );
    const lines = (rows ?? []).map((r) => `#${r.id.slice(0, 4)} · ${placeName(r.city, r.country)} · ${r.n} messages · ${Math.round((Date.now() - Date.parse(r.last)) / 60000)}m ago`);
    await send(me.chatId, lines.length ? `Open chats (last 24h):\n${lines.join("\n")}` : "No chats in the last day.");
    return new Response("ok");
  }
  if (!text) {
    await send(me.chatId, "Only text gets passed on for now.", m.message_id);
    return new Response("ok");
  }

  // Which conversation: the one I replied to, else the most recent one.
  let thread: string | null = null;
  let routed = false;
  if (m.reply_to_message) {
    const r = await q<{ thread: string }>("talk route", (db) =>
      db`SELECT thread FROM talk_messages WHERE tg_id = ${m.reply_to_message!.message_id} LIMIT 1`,
    );
    thread = r?.[0]?.thread ?? null;
  }
  if (!thread) {
    const r = await q<{ id: string }>("talk latest", (db) =>
      db`SELECT id FROM talk_threads WHERE last_at > now() - interval '30 minutes' ORDER BY last_at DESC LIMIT 1`,
    );
    thread = r?.[0]?.id ?? null;
    routed = !!thread;
  }
  if (!thread) {
    await send(me.chatId, "Nobody's waiting right now. Reply to a visitor's message to answer them.", m.message_id);
    return new Response("ok");
  }

  const body = text.slice(0, 2000);
  const rows = await q<{ id: string; at: string }>("talk reply", (db) =>
    db`INSERT INTO talk_messages (thread, side, text, tg_id) VALUES (${thread}, 'me', ${body}, ${m.message_id}) RETURNING id, at`,
  );
  if (!rows?.[0]) {
    await send(me.chatId, "Couldn't save that one. Try again?", m.message_id);
    return new Response("ok");
  }
  await q("talk touch", (db) => db`UPDATE talk_threads SET last_at = now() WHERE id = ${thread}`);
  await push(`talk:${thread}`, "message", { id: Number(rows[0].id), side: "me", text: body, at: new Date(rows[0].at).toISOString() });

  if (routed) {
    const t = await q<{ city: string | null; country: string | null }>("talk where", (db) => db`SELECT city, country FROM talk_threads WHERE id = ${thread}`);
    await send(me.chatId, `→ sent to #${thread.slice(0, 4)} · ${placeName(t?.[0]?.city, t?.[0]?.country)}`, m.message_id);
  } else {
    await tg("setMessageReaction", { chat_id: me.chatId, message_id: m.message_id, reaction: [{ type: "emoji", emoji: "👌" }] });
  }
  return new Response("ok");
}

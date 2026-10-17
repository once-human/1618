import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import { allow, q, visitorKey } from "@/lib/db";
import { geoOf, placeName } from "@/lib/geo";
import { moderate, moderateName } from "@/lib/moderation";
import { owner, telegramConfigured, tg } from "@/lib/talk/telegram";

/**
 * Talk to me, live. A visitor's message is kept, then sent to my Telegram;
 * my reply comes back through /api/telegram and is pushed to their screen.
 *
 *   GET  /api/talk?thread=…&after=…   is it on, and the conversation so far
 *   POST /api/talk { thread?, text, name?, page? }
 *
 * A conversation is a random code the visitor's browser keeps. Only I see
 * the messages. Talk is always open: while my phone isn't hooked up (no
 * Telegram yet), messages are kept and I answer them from /admin instead.
 * "live" says which of the two it is right now.
 */
const THREAD = /^[a-f0-9]{32}$/;
const say = (reason: string, status = 400) => Response.json({ ok: false, reason }, { status });

export interface TalkMessage {
  id: number;
  side: "visitor" | "me";
  text: string;
  at: string;
}

async function messages(thread: string, after = 0): Promise<TalkMessage[]> {
  const rows = await q<{ id: string; side: "visitor" | "me"; text: string; at: string }>("talk read", (db) =>
    db`SELECT id, side, text, at FROM talk_messages WHERE thread = ${thread} AND id > ${after} ORDER BY id LIMIT 200`,
  );
  return (rows ?? []).map((r) => ({ id: Number(r.id), side: r.side, text: r.text, at: new Date(r.at).toISOString() }));
}

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const thread = url.searchParams.get("thread") ?? "";
  const after = Number(url.searchParams.get("after")) || 0;
  const live = telegramConfigured() && !!(await owner());
  const list = THREAD.test(thread) ? await messages(thread, after) : [];
  return Response.json({ live, messages: list }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return say("that didn't come through right. try again?");
  }
  if (body.website) return Response.json({ ok: true }); // bots fill every field

  const me = telegramConfigured() ? await owner() : null;

  const text = moderate(typeof body.text === "string" ? body.text : "", { max: 1000, links: true });
  if (!text.ok) return say(text.reason);
  const name = moderateName(typeof body.name === "string" ? body.name : "");
  if (!name.ok) return say(name.reason);

  const who = visitorKey(req);
  if (!(await allow(`talk:${who}`, 20, 600))) return say("easy, one at a time 🙂 give it a minute", 429);

  let thread = typeof body.thread === "string" && THREAD.test(body.thread) ? body.thread : null;
  const known = thread ? await q<{ id: string }>("talk thread", (db) => db`SELECT id FROM talk_threads WHERE id = ${thread}`) : null;
  const isNew = !known?.length;
  if (isNew) {
    if (!(await allow(`talk-new:${who}`, 5, 3600))) return say("that's a lot of new chats. try again later?", 429);
    thread = randomBytes(16).toString("hex");
    const geo = geoOf(req);
    const page = typeof body.page === "string" ? body.page.slice(0, 80) : null;
    await q("talk new", (db) =>
      db`INSERT INTO talk_threads (id, city, country, page) VALUES (${thread}, ${geo.city}, ${geo.country}, ${page})`,
    );
  }

  const rows = await q<{ id: string; at: string }>("talk write", (db) =>
    db`INSERT INTO talk_messages (thread, side, text) VALUES (${thread}, 'visitor', ${text.text}) RETURNING id, at`,
  );
  if (!rows?.[0]) return say("something broke on my end. try again?", 500);
  const id = Number(rows[0].id);

  // To my phone. The first message says where they are; replying to any of them answers.
  const info = await q<{ city: string | null; country: string | null; page: string | null }>("talk info", (db) =>
    db`UPDATE talk_threads SET last_at = now() WHERE id = ${thread} RETURNING city, country, page`,
  );
  const where = placeName(info?.[0]?.city, info?.[0]?.country);
  const tag = `#${thread!.slice(0, 4)}`;
  const who_ = name.text || "Someone";
  const head = isNew ? `💬 New chat ${tag} · ${where}${info?.[0]?.page ? ` · on ${info[0].page}` : ""}\n` : `💬 ${tag} · ${where}\n`;
  const sent = me ? await tg<{ message_id: number }>("sendMessage", {
    chat_id: me.chatId,
    text: `${head}${who_}: ${text.text}${isNew ? "\n\n↩️ Reply to this message to answer." : ""}`,
    link_preview_options: { is_disabled: true },
  }) : null;
  if (sent) await q("talk tg", (db) => db`UPDATE talk_messages SET tg_id = ${sent.message_id} WHERE id = ${id}`);

  return Response.json({
    ok: true,
    thread,
    delivered: !!sent,
    live: !!me,
    message: { id, side: "visitor", text: text.text, at: new Date(rows[0].at).toISOString() } satisfies TalkMessage,
  });
}

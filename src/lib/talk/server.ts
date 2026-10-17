import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { allow, kvGet, q, visitorKey } from "@/lib/db";
import { geoOf, placeName } from "@/lib/geo";
import { moderate, moderateName } from "@/lib/moderation";
import { owner, push, telegramConfigured, tg } from "./telegram";
import { networkOf, OSES, screenOf } from "@/lib/presence/device";
import { deviceName } from "@/lib/ua";

/**
 * Talk, the server side, shared by the site (/api/talk) and the terminal
 * (curl …/talk). A conversation is a random 128-bit code: whoever holds it
 * can read, write or delete that one conversation, and nothing else.
 *
 * Open, but not a pipe for flooding my phone:
 * - everyone is asked their name first; "stay anonymous" is a fine answer
 * - one chat per browser, under one name (a new name means a new chat)
 * - at most 5 messages in a row until I reply; no new chat (or new name) while
 *   5 are waiting from that network; at most 10 unanswered across its chats
 * - per network: 20 messages / 10 min; 3 new chats an hour and 6 a day
 * - everyone together: 300 messages and 60 new chats an hour reach my phone at most
 * - the same message twice in a row is dropped; bots that fill the hidden field are dropped
 * - words get the same moderation as the guestbook (code is fine here)
 * - each chat keeps one-way fingerprints of the network and device it came
 *   from (never the address itself), so /block shuts out that network for good
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
  /** They chose to stay anonymous. (No name and not anon: a chat from before names were asked for.) */
  anon: boolean;
  messages: TalkMessage[];
}

export const isLive = async () => telegramConfigured() && !!(await owner());

type Fail = { ok: false; reason: string; status: number };
const fail = (reason: string, status = 400): Fail => ({ ok: false, reason, status });

const currentNameOf = (rows: { name: string | null }[] | null) => rows?.[0]?.name ?? null;

/**
 * Where a message comes from, as one-way codes: the network (household or
 * phone connection) and the device on it, plus a readable "iPhone, Safari".
 * Salted, so they can't be turned back into an address; stable, so limits
 * and blocks hold across days and private windows.
 */
export function fingerprint(req: Request, dev?: { os?: unknown; w?: unknown; h?: unknown } | null) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const salt = process.env.HASH_SALT ?? "";
  const network = networkOf(ip);
  const ua = req.headers.get("user-agent") ?? "";
  const os = typeof dev?.os === "string" && (OSES as readonly string[]).includes(dev.os) ? dev.os : "other";
  const name = deviceName(ua);
  const hash = (what: string) => createHmac("sha256", salt).update(what).digest("hex").slice(0, 16);
  return { net: hash(`talk-net|${network}`), device: hash(`talk-dev|${network}|${os}|${screenOf(dev?.w, dev?.h) ?? "?"}|${name}`), ua: name };
}

export async function isBlockedNet(net: string): Promise<boolean> {
  return !!(await kvGet(`talk-block:net:${net}`));
}

export async function readThreads(want: { id: string; after: number }[]): Promise<Record<string, ThreadView>> {
  const ids = want.map((w) => w.id).filter((id) => THREAD.test(id)).slice(0, 20);
  if (!ids.length) return {};
  const [threads, msgs] = await Promise.all([
    q<{ id: string; name: string | null; anon: boolean }>("talk threads", (db) => db`SELECT id, name, anon FROM talk_threads WHERE id = ANY(${ids})`),
    q<{ id: string; thread: string; side: "visitor" | "me"; text: string; at: string }>("talk read", (db) =>
      db`SELECT id, thread, side, text, at FROM talk_messages WHERE thread = ANY(${ids}) ORDER BY id LIMIT 2000`,
    ),
  ]);
  const out: Record<string, ThreadView> = {};
  if (!threads) return out; // database down: say nothing rather than "deleted"
  for (const id of ids) out[id] = { exists: false, name: null, anon: false, messages: [] };
  for (const t of threads) out[t.id] = { exists: true, name: t.name, anon: t.anon, messages: [] };
  const after = new Map(want.map((w) => [w.id, w.after]));
  for (const m of msgs ?? []) {
    if (Number(m.id) <= (after.get(m.thread) ?? 0)) continue;
    out[m.thread]?.messages.push({ id: Number(m.id), side: m.side, text: m.text, at: new Date(m.at).toISOString() });
  }
  return out;
}

export async function postMessage(
  req: Request,
  input: { thread?: unknown; text?: unknown; name?: unknown; anon?: unknown; dev?: unknown; page?: unknown; website?: unknown },
  via: "site" | "terminal",
): Promise<Fail | { ok: true; thread: string; isNew: boolean; delivered: boolean; live: boolean; message: TalkMessage; name: string | null; anon: boolean }> {
  if (input.website) return fail("thanks!", 200); // the hidden field: only bots fill it

  const text = moderate(typeof input.text === "string" ? input.text : "", { max: MAX_TEXT, links: true, code: true });
  if (!text.ok) return fail(text.reason);
  const name = typeof input.name === "string" && input.name.trim() ? moderateName(input.name) : null;
  if (name && !name.ok) return fail(name.reason);
  const given = name?.ok && name.text.trim().length >= 2 ? name.text.trim() : null;
  const anon = input.anon === true || input.anon === "1" || input.anon === "true";

  const f = fingerprint(req, input.dev && typeof input.dev === "object" ? (input.dev as Record<string, unknown>) : null);
  let thread = typeof input.thread === "string" && THREAD.test(input.thread) ? input.thread : null;
  const known = thread
    ? await q<{ id: string; name: string | null; anon: boolean; blocked: boolean }>("talk thread", (db) => db`SELECT id, name, anon, blocked FROM talk_threads WHERE id = ${thread}`)
    : null;
  if (thread && known && !known.length) return fail("that chat was deleted. start a new one?", 404);
  const legacyBlock = await kvGet<{ until: number }>(`talk-block:${visitorKey(req)}`);
  if (known?.[0]?.blocked || (await isBlockedNet(f.net)) || (legacyBlock && legacyBlock.value.until > Date.now()))
    return fail("I've closed this chat. Email works if it's important.", 403);

  const isNew = !thread;
  let currentName = currentNameOf(known); // fixed once the chat starts
  const decided = !!currentName || !!known?.[0]?.anon;
  // Everyone is asked first: a name, or "stay anonymous".
  if (!decided && !given && !anon)
    return fail(via === "terminal" ? "tell me your name (add &name=YourName), or add &anon=1 to stay anonymous" : "tell me your name first, or choose to stay anonymous 🙂", 400);

  if (!(await allow(`talk:${f.net}`, 20, 600))) return fail("easy, one at a time 🙂 give it a minute", 429);

  if (!isNew) {
    // At most 5 in a row until I reply.
    const run = await q<{ n: number; last: string | null; last_at: string | null }>("talk run", (db) =>
      db`SELECT count(*)::int AS n,
                (SELECT text FROM talk_messages WHERE thread = ${thread} ORDER BY id DESC LIMIT 1) AS last,
                (SELECT at FROM talk_messages WHERE thread = ${thread} ORDER BY id DESC LIMIT 1) AS last_at
         FROM talk_messages m WHERE m.thread = ${thread} AND m.side = 'visitor'
           AND m.id > coalesce((SELECT max(id) FROM talk_messages WHERE thread = ${thread} AND side = 'me'), 0)`,
    );
    const r = run?.[0];
    if ((r?.n ?? 0) >= 5) return fail("that's 5 in a row 🙂 wait for me to reply, then carry on.", 429);
    // The same thing twice in a row is a double-tap or a loop, not a message.
    if (r?.last === text.text && r.last_at && Date.now() - Date.parse(r.last_at) < 10 * 60_000) return fail("you just sent that one 🙂");
  }
  // Across every chat from this network, so starting a new one doesn't reset the count.
  const waiting = await q<{ n: number }>("talk net waiting", (db) =>
    db`SELECT count(*)::int AS n FROM talk_messages m JOIN talk_threads t ON t.id = m.thread
       WHERE t.net = ${f.net} AND m.side = 'visitor' AND m.at > now() - interval '7 days'
         AND m.id > coalesce((SELECT max(id) FROM talk_messages r WHERE r.thread = m.thread AND r.side = 'me'), 0)`,
  );
  if ((waiting?.[0]?.n ?? 0) >= 10) return fail("you've got lots waiting on me already 🙂 I'll reply soon.", 429);
  // A fresh chat (or a new name) is no way round "wait for my reply".
  if (!thread && (waiting?.[0]?.n ?? 0) >= 5) return fail("you've got messages waiting on me already 🙂 I'll reply soon, then you can carry on.", 429);

  let earlier = 0;
  if (isNew) {
    if (!(await allow(`talk-new:${f.net}`, 3, 3600)) || !(await allow(`talk-new-day:${f.net}`, 6, 86400)))
      return fail("you've started a few chats already. give it a while before starting another?", 429);
    if (!(await allow("talk-new:all", 60, 3600))) return fail("lots of people writing right now. try again in a bit?", 429);
    earlier = (await q<{ n: number }>("talk net chats", (db) => db`SELECT count(*)::int AS n FROM talk_threads WHERE net = ${f.net}`))?.[0]?.n ?? 0;
    thread = randomBytes(16).toString("hex");
    const geo = geoOf(req);
    const page = typeof input.page === "string" ? input.page.slice(0, 80) : null;
    currentName = given;
    const made = await q("talk new", (db) =>
      db`INSERT INTO talk_threads (id, city, country, page, name, anon, who, net, device, ua, via)
         VALUES (${thread}, ${geo.city}, ${geo.country}, ${page}, ${currentName}, ${!given}, ${visitorKey(req)}, ${f.net}, ${f.device}, ${f.ua}, ${via})`,
    );
    if (!made) return fail("something broke on my end. try again?", 500);
  } else if (!decided) {
    // A chat from before names were asked for: the answer is kept (once; after that it's fixed).
    await q("talk name", (db) => db`UPDATE talk_threads SET name = ${given}, anon = ${!given} WHERE id = ${thread} AND name IS NULL`);
    currentName = given;
  }

  const rows = await q<{ id: string; at: string }>("talk write", (db) =>
    db`INSERT INTO talk_messages (thread, side, text) VALUES (${thread}, 'visitor', ${text.text}) RETURNING id, at`,
  );
  if (!rows?.[0]) return fail("something broke on my end. try again?", 500);
  const id = Number(rows[0].id);
  const info = await q<{ city: string | null; country: string | null; page: string | null }>("talk touch", (db) =>
    db`UPDATE talk_threads SET last_at = now(), net = coalesce(net, ${f.net}), device = coalesce(device, ${f.device}), ua = coalesce(ua, ${f.ua}) WHERE id = ${thread} RETURNING city, country, page`,
  );

  const me = telegramConfigured() ? await owner() : null;
  let delivered = false;
  if (me && (await allow("talk-phone:all", 300, 3600))) {
    const tag = `#${thread!.slice(0, 4)}`;
    const who_ = currentName || "Anonymous";
    const where = placeName(info?.[0]?.city, info?.[0]?.country);
    const head = isNew
      ? `💬 New chat ${tag} · ${who_} · ${where} · ${f.ua}${via === "terminal" ? " · from a terminal" : info?.[0]?.page ? ` · on ${info[0].page}` : ""}${earlier ? ` · ${earlier} earlier chat${earlier === 1 ? "" : "s"} from this network` : ""}\n\n`
      : `💬 ${tag} · ${who_}\n`;
    const sent = await tg<{ message_id: number }>("sendMessage", {
      chat_id: me.chatId,
      text: `${head}${text.text}${isNew ? "\n\n↩️ Swipe-reply to answer · /block to shut out their network" : ""}`,
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
    anon: !currentName,
    message: { id, side: "visitor", text: text.text, at: new Date(rows[0].at).toISOString() },
  };
}

/**
 * Delete a conversation for good, from the site and from the visitor's
 * browser. My copies on Telegram stay (that's my phone, not the site).
 */
export async function deleteThread(req: Request, thread: unknown): Promise<Fail | { ok: true }> {
  if (typeof thread !== "string" || !THREAD.test(thread)) return fail("no such chat", 404);
  if (!(await allow(`talk-edit:${fingerprint(req).net}`, 10, 3600))) return fail("that's a lot of changes. try later?", 429);
  const gone = await q<{ name: string | null }>("talk delete", (db) => db`DELETE FROM talk_threads WHERE id = ${thread} RETURNING name`);
  if (!gone?.length) return { ok: true }; // already gone is fine
  const me = telegramConfigured() ? await owner() : null;
  if (me) await tg("sendMessage", { chat_id: me.chatId, text: `🗑 #${thread.slice(0, 4)} (${gone[0].name || "Anonymous"}) deleted their chat. Your copies here stay.` });
  await push(`talk:${thread}`, "deleted", {});
  return { ok: true };
}

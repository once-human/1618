import { isAdmin, q } from "@/lib/db";
import { push } from "@/lib/talk/telegram";

/**
 * Answer a conversation from /admin (for when Telegram isn't hooked up, or
 * I'm at the laptop). Same path as a Telegram reply: kept, then pushed to
 * the visitor's screen if they're still there.
 */
export async function POST(req: Request) {
  if (!isAdmin(req)) return new Response("Not allowed", { status: 401 });
  const form = await req.formData();
  const thread = String(form.get("thread") ?? "");
  const text = String(form.get("text") ?? "").trim().slice(0, 2000);
  const back = Response.redirect(new URL(`/admin#chat-${thread.slice(0, 8)}`, req.url), 303);
  if (!/^[a-f0-9]{32}$/.test(thread) || !text) return back;
  const rows = await q<{ id: string; at: string }>("talk admin reply", (db) =>
    db`INSERT INTO talk_messages (thread, side, text) VALUES (${thread}, 'me', ${text}) RETURNING id, at`,
  );
  if (rows?.[0]) {
    await q("talk touch", (db) => db`UPDATE talk_threads SET last_at = now() WHERE id = ${thread}`);
    await push(`talk:${thread}`, "message", { id: Number(rows[0].id), side: "me", text, at: new Date(rows[0].at).toISOString() });
  }
  return back;
}

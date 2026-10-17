import { ADMIN_COOKIE, isAdmin, kvDelete, kvSet, logOutEverywhere, newSession, q } from "@/lib/db";
import { push, owner, telegramConfigured, tg } from "@/lib/talk/telegram";
import { THREAD } from "@/lib/talk/server";
import { hold, letGo, savePlace } from "@/lib/admin/place";
import { runSync } from "@/lib/history/sync";
import type { ManualStatus } from "@/lib/presence/types";

/**
 * Every change /admin makes, as one small JSON call: { action, ... }.
 * Admin only (logged-in browser from this site, or the key in a header).
 */
const ok = (body: Record<string, unknown> = {}) => Response.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store" } });
const no = (reason: string, status = 400) => Response.json({ ok: false, reason }, { status });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return no("Log in again.", 401);
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return no("That request didn't come through.");
  }
  const thread = typeof b.thread === "string" && THREAD.test(b.thread) ? b.thread : null;

  switch (b.action) {
    /* ---- talk ---- */
    case "reply": {
      const text = str(b.text, 2000);
      if (!thread || !text) return no("Write something first.");
      const rows = await q<{ id: string; at: string }>("admin reply", (db) =>
        db`INSERT INTO talk_messages (thread, side, text) SELECT ${thread}, 'me', ${text} WHERE EXISTS (SELECT 1 FROM talk_threads WHERE id = ${thread}) RETURNING id, at`,
      );
      if (!rows?.[0]) return no("That chat isn't there any more.", 404);
      await q("talk touch", (db) => db`UPDATE talk_threads SET last_at = now(), admin_read_at = now() WHERE id = ${thread}`);
      const message = { id: Number(rows[0].id), side: "me", text, at: new Date(rows[0].at).toISOString() };
      await push(`talk:${thread}`, "message", message);
      return ok({ message });
    }
    case "read":
    case "unread": {
      // Read: it's been seen here, so it stops waiting on me. Unread puts it back.
      if (!thread) return no("No such chat.", 404);
      await q("admin read", (db) =>
        b.action === "read" ? db`UPDATE talk_threads SET admin_read_at = now() WHERE id = ${thread}` : db`UPDATE talk_threads SET admin_read_at = NULL WHERE id = ${thread}`,
      );
      return ok();
    }
    case "block":
    case "unblock": {
      if (!thread) return no("No such chat.", 404);
      const on = b.action === "block";
      const r = await q<{ who: string | null; net: string | null }>("admin block", (db) => db`UPDATE talk_threads SET blocked = ${on} WHERE id = ${thread} RETURNING who, net`);
      const t = r?.[0];
      // The whole network they write from, for good (until unblocked).
      if (t?.net) {
        if (on) await kvSet(`talk-block:net:${t.net}`, { at: new Date().toISOString(), thread });
        else await kvDelete(`talk-block:net:${t.net}`);
      }
      if (!on && t?.who) await kvDelete(`talk-block:${t.who}`);
      return ok();
    }
    case "deleteThread": {
      if (!thread) return no("No such chat.", 404);
      // From the site only: my copies on Telegram stay.
      await q("admin delete thread", (db) => db`DELETE FROM talk_threads WHERE id = ${thread}`);
      await push(`talk:${thread}`, "deleted", {});
      return ok();
    }

    /* ---- songs and guestbook ---- */
    case "post": {
      const id = Number(b.id);
      if (!Number.isInteger(id)) return no("No such post.", 404);
      if (b.op === "hide") await q("hide", (db) => db`UPDATE submissions SET hidden = true WHERE id = ${id}`);
      else if (b.op === "show") await q("show", (db) => db`UPDATE submissions SET hidden = false WHERE id = ${id}`);
      else if (b.op === "delete") await q("delete", (db) => db`DELETE FROM submissions WHERE id = ${id}`);
      else return no("Hide, show or delete?");
      return ok();
    }

    /* ---- me ---- */
    case "status": {
      const text = str(b.text, 80);
      if (!text) return no("Write a status first.");
      const minutes = Math.min(48 * 60, Math.max(10, Number(b.minutes) || 240));
      const now = Date.now();
      const status: ManualStatus = { text, setAt: new Date(now).toISOString(), until: new Date(now + minutes * 60_000).toISOString() };
      await kvSet("status", status);
      return ok({ status });
    }
    case "clearStatus":
      await kvDelete("status");
      return ok();
    case "place": {
      const city = str(b.city, 60);
      const lat = Number(b.lat);
      const lon = Number(b.lon);
      const tz = str(b.tz, 60);
      if (!city || !Number.isFinite(lat) || !Number.isFinite(lon) || !tz) return no("Pick a place from the list.");
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
      } catch {
        return no("That place's time zone looks wrong.");
      }
      const place = await savePlace({ city, lat, lon, tz, country: str(b.country, 2) || null });
      if (b.hold) await hold(typeof b.holdHours === "number" ? b.holdHours : null);
      return ok({ place });
    }
    case "hold":
      return ok({ hold: await hold(typeof b.hours === "number" && b.hours > 0 ? b.hours : null) });
    case "letGo":
      await letGo();
      return ok();

    /* ---- the site ---- */
    case "sync": {
      const report = await runSync({ force: true });
      return ok({ report });
    }
    case "telegramTest": {
      const me = telegramConfigured() ? await owner() : null;
      if (!me) return no("Telegram isn't connected yet.");
      const sent = await tg("sendMessage", { chat_id: me.chatId, text: "✅ Test from /admin. Messages from the site arrive here." });
      return sent ? ok() : no("Telegram didn't take it. Try reconnecting.");
    }
    case "logoutAll": {
      await logOutEverywhere();
      // Everyone else is out; this browser gets a fresh login so you stay in.
      const s = await newSession();
      const res = ok();
      res.headers.append("Set-Cookie", `${ADMIN_COOKIE}=${s.value}; Path=/; Max-Age=${s.maxAge}; HttpOnly; Secure; SameSite=Strict`);
      return res;
    }
  }
  return no("Unknown action.");
}

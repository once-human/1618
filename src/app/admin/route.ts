import { connection } from "next/server";
import { isAdmin, kvGet, q } from "@/lib/db";
import { getPlace, getStatus } from "@/lib/presence/server";
import { owner, telegramConfigured } from "@/lib/talk/telegram";
import { placeName } from "@/lib/geo";

/**
 * My private control page: open /admin?key=<ADMIN_SECRET>. Hide or delete
 * posts, set my status, see how the history store is doing, connect
 * Telegram for live chat, get the iPhone shortcuts.
 * Plain HTML on purpose: it only has to work.
 */
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(req: Request) {
  await connection();
  if (!isAdmin(req)) return new Response("Not found", { status: 404 });
  const key = encodeURIComponent(new URL(req.url).searchParams.get("key") ?? "");

  const [posts, counts, sync, backfill, status, tgOwner, place, shortcuts, chats] = await Promise.all([
    q<{ id: number; kind: string; name: string | null; message: string | null; payload: { track?: string; artist?: string } | null; hidden: boolean; created_at: string }>(
      "admin posts",
      (db) => db`SELECT id, kind, name, message, payload, hidden, created_at FROM submissions ORDER BY created_at DESC LIMIT 100`,
    ),
    q<{ plays: number; first: string | null; pins: number; events: number; health: number }>("admin counts", (db) =>
      db`SELECT (SELECT count(*)::int FROM scrobbles) AS plays,
                (SELECT to_char(to_timestamp(min(uts)) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') FROM scrobbles) AS first,
                (SELECT count(*)::int FROM pins) AS pins,
                (SELECT count(*)::int FROM events) AS events,
                (SELECT count(*)::int FROM health_days) AS health`,
    ),
    kvGet<{ at: string }>("sync:last"),
    kvGet<{ done: boolean }>("backfill:lastfm"),
    getStatus(),
    owner(),
    getPlace(),
    q<{ key: string }>("admin shortcuts", (db) => db`SELECT key FROM kv WHERE key LIKE 'shortcut:%'`).then((r) => new Set((r ?? []).map((x) => x.key.slice(9)))),
    q<{ id: string; city: string | null; country: string | null; page: string | null; last_at: string; log: { side: string; text: string; at: string }[] }>("admin chats", (db) =>
      db`SELECT t.id, t.city, t.country, t.page, t.last_at,
                json_agg(json_build_object('side', m.side, 'text', m.text, 'at', m.at) ORDER BY m.id) AS log
         FROM talk_threads t JOIN talk_messages m ON m.thread = t.id
         GROUP BY t.id ORDER BY t.last_at DESC LIMIT 20`,
    ),
  ]);
  const c = counts?.[0];

  const rows = (posts ?? [])
    .map(
      (p) => `<tr class="${p.hidden ? "hidden" : ""}">
  <td>${esc(p.kind)}</td>
  <td>${esc(p.name ?? "—")}</td>
  <td>${p.payload?.track ? `<b>${esc(p.payload.track)}</b>, ${esc(p.payload.artist)}<br>` : ""}${esc(p.message ?? "")}</td>
  <td>${esc(new Date(p.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}</td>
  <td><form method="post" action="/api/admin?key=${key}">
    <input type="hidden" name="id" value="${p.id}">
    ${p.hidden ? `<button name="action" value="show">show</button>` : `<button name="action" value="hide">hide</button>`}
    <button name="action" value="delete" onclick="return confirm('Delete for good?')">delete</button>
  </form></td>
</tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>admin</title>
<style>
  body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px;max-width:1100px}
  h1{font-size:40px;margin:0 0 16px}h2{font-size:15px;border-top:1px solid #000;padding-top:6px;margin:32px 0 8px}
  table{width:100%;border-collapse:collapse}td{border-top:1px solid #ddd;padding:6px 8px 6px 0;vertical-align:top}
  tr.hidden td{color:#999;text-decoration:line-through}button{font:inherit;margin-right:4px}
  input[type=text]{font:inherit;width:min(420px,100%)}.q{color:#6e6e6e}
</style></head><body>
<h1>admin</h1>

<h2>Status</h2>
<p>${status ? `“${esc(status.text)}” until ${esc(new Date(status.until).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}` : "<span class=q>None set.</span>"}</p>
<form method="post" action="/api/status?key=${key}">
  <input type="text" name="text" placeholder="heads-down till 6" maxlength="80">
  <input type="number" name="hours" value="4" min="0.25" max="48" step="0.25" style="width:5em"> hours
  <button>Set</button>
</form>

<h2>Where I am</h2>
<p>${esc(place.city)} <span class=q>(${esc(place.tz)}${place.setAt ? `, set ${esc(new Date(place.setAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}` : ", default"})</span></p>
<form method="post" action="/api/location?key=${key}">
  <input type="text" name="city" placeholder="Bengaluru" maxlength="60">
  <button>Set</button>
</form>

<h2>History store</h2>
<p>${c ? `${c.plays.toLocaleString("en-IN")} plays since ${esc(c.first ?? "—")} · ${c.pins} pins · ${c.events} pushes, runs and workouts · ${c.health} Health days` : "Database unreachable."}<br>
<span class=q>Last sync ${sync ? esc(new Date(sync.value.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })) : "never"}. Last.fm backfill ${backfill?.value.done ? "complete" : "still running"}.</span>
<a href="/api/sync?key=${key}">Sync now</a></p>

<h2>Talk to me (Telegram)</h2>
<p>${
    !telegramConfigured()
      ? "<span class=q>Off. Make a bot with @BotFather in Telegram, add its token in Vercel as TELEGRAM_BOT_TOKEN, redeploy, then come back here.</span>"
      : tgOwner
        ? `On: visitors' messages go to ${esc(tgOwner.name || "you")} on Telegram. Reply to one to answer. <span class=q>(<a href="/api/telegram/connect?key=${key}">reconnect</a>)</span>`
        : `Bot is ready. <a href="/api/telegram/connect?key=${key}"><b>Connect Telegram</b></a>, then press Start in the chat that opens. <span class=q>The link works once, for 15 minutes.</span>`
  }</p>
${(chats ?? [])
  .map(
    (t) => `<details><summary>#${esc(t.id.slice(0, 4))} · ${esc(placeName(t.city, t.country))}${t.page ? ` · ${esc(t.page)}` : ""} · ${t.log.length} messages · ${esc(new Date(t.last_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}</summary>
<ul>${t.log.map((m) => `<li><b>${m.side === "me" ? "me" : "them"}:</b> ${esc(m.text)}</li>`).join("")}</ul></details>`,
  )
  .join("")}

<h2>iPhone shortcuts</h2>
<p class=q>Open this page on your iPhone in Safari, tap one, open the download, and paste your site key when it asks. Run it once from the Shortcuts app to allow access.</p>
<ul>
  <li><a href="/api/shortcuts/health">1618 Health</a> ${shortcuts.has("health") ? "" : "<span class=q>(not uploaded yet)</span>"}: today's steps, distance and calories. Automate it: Shortcuts → Automation → <b>App → Is Opened</b> (an app you open often) → run immediately. Health can't be read while the phone is locked, so a time-of-day automation won't work.</li>
  <li><a href="/api/shortcuts/location">1618 Location</a> ${shortcuts.has("location") ? "" : "<span class=q>(not uploaded yet)</span>"}: your city, for the clock and weather. Automate it: <b>Time of Day</b>, a few times a day, or <b>Arrive</b> at a place.</li>
  <li><a href="/api/shortcuts/status">1618 Status</a> ${shortcuts.has("status") ? "" : "<span class=q>(not uploaded yet)</span>"}: set the line at the top of the site, or leave it empty to clear it. Put it on the Action Button or Back Tap.</li>
</ul>

<h2>Songs and guestbook (${(posts ?? []).length})</h2>
<table>${rows || "<tr><td class=q>Nothing yet.</td></tr>"}</table>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

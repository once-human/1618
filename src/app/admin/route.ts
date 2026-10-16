import { connection } from "next/server";
import { isAdmin, kvGet, q } from "@/lib/db";
import { getStatus } from "@/lib/presence/server";
import { stravaConfigured } from "@/lib/history/strava";

/**
 * My private control page: open /admin?key=<ADMIN_SECRET>. Hide or delete
 * posts, set my status, see how the history store is doing, connect Strava.
 * Plain HTML on purpose: it only has to work.
 */
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(req: Request) {
  await connection();
  if (!isAdmin(req)) return new Response("Not found", { status: 404 });
  const key = encodeURIComponent(new URL(req.url).searchParams.get("key") ?? "");

  const [posts, counts, sync, backfill, status, strava] = await Promise.all([
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
    kvGet<{ expiresAt: number }>("strava:token"),
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

<h2>History store</h2>
<p>${c ? `${c.plays.toLocaleString("en-IN")} plays since ${esc(c.first ?? "—")} · ${c.pins} pins · ${c.events} pushes, runs and workouts · ${c.health} Health days` : "Database unreachable."}<br>
<span class=q>Last sync ${sync ? esc(new Date(sync.value.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })) : "never"}. Last.fm backfill ${backfill?.value.done ? "complete" : "still running"}.</span>
<a href="/api/sync?key=${key}">Sync now</a></p>

<h2>Strava</h2>
<p>${stravaConfigured() ? (strava ? "Connected." : `<a href="/api/strava/connect?key=${key}">Connect Strava</a>`) : "<span class=q>Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in Vercel first.</span>"}</p>

<h2>Songs and guestbook (${(posts ?? []).length})</h2>
<table>${rows || "<tr><td class=q>Nothing yet.</td></tr>"}</table>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

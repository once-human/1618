import { isAdmin } from "@/lib/db";
import { ingest } from "@/lib/desk/server";

/**
 * The laptop agent (github.com/once-human/desk-agent) posts here in batches (every 15 minutes by default, sooner when you sit down or walk away).
 *
 *   POST /api/ingest/desk   Authorization: Bearer <ADMIN_SECRET>
 *   { "samples": [ { "t": "2026-10-26T10:00:00Z", "active": true, "idleS": 3,
 *       "app": { "id": "kitty", "name": "Kitty", "category": "terminal" },
 *       "site": { "host": "github.com", "name": "GitHub", "category": "code" },
 *       "repo": "1618", "claude": true,
 *       "media": { "player": "spotify", "state": "playing", "source": "spotify", "title": "…", "artist": "…" },
 *       "battery": { "pct": 80, "charging": false } } ] }
 *
 * Window titles never arrive; YouTube titles are dropped here too, whatever is sent.
 */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Send JSON", { status: 400 });
  }
  return Response.json({ ok: true, kept: await ingest(body) });
}

import { connection } from "next/server";
import { allow } from "@/lib/db";
import { forget, mine, record } from "@/lib/visits/server";
import { ID, type TrackBatch } from "@/lib/visits/shared";

/**
 * The visitor log (see /privacy).
 *
 *   POST   /api/track           a batch from the page: the visit, pages, clicks
 *   GET    /api/track?me=<code> everything kept about this browser
 *   DELETE /api/track?me=<code> forget it all
 *
 * <code> is the random code the browser made for itself; only that browser
 * has it. Nothing here ever stores an IP address.
 */
const headers = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  // Sent with navigator.sendBeacon, so it may arrive as text.
  const text = await req.text();
  if (text.length > 64_000) return new Response(null, { status: 413 });
  let b: TrackBatch;
  try {
    b = JSON.parse(text) as TrackBatch;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!b || !ID.test(b.v ?? "") || !ID.test(b.s ?? "") || !Array.isArray(b.events)) return new Response(null, { status: 400 });
  // A busy visit sends a batch every few seconds at most.
  if (!(await allow(`track:${b.s}`, 400, 3600))) return new Response(null, { status: 429 });
  const ok = await record(req, b);
  return new Response(null, { status: ok ? 204 : 409, headers });
}

const code = (req: Request) => {
  const me = new URL(req.url).searchParams.get("me") ?? "";
  return ID.test(me) ? me : null;
};

export async function GET(req: Request) {
  await connection();
  const me = code(req);
  if (!me) return new Response("Send ?me=<your code>", { status: 400 });
  if (!(await allow(`track-me:${me}`, 60, 3600))) return new Response(null, { status: 429 });
  return Response.json(await mine(me), { headers });
}

export async function DELETE(req: Request) {
  const me = code(req);
  if (!me) return new Response("Send ?me=<your code>", { status: 400 });
  return Response.json({ ok: true, deleted: await forget(me) }, { headers });
}

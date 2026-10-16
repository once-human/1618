import { allow, q, visitorKey } from "@/lib/db";

/**
 * "N people here right now", counted as people rather than page loads.
 *
 * Each tab keeps one random id for as long as it's open (it survives a
 * refresh), says "still here" every 15 seconds while you're looking at it,
 * and "gone" the moment you close it or switch away. People are counted by a
 * one-way daily hash of the connection, so a refresh or a second tab is still
 * one person. Nothing here can say who you are.
 */
const WINDOW = "35 seconds";

export async function POST(req: Request) {
  let body: { id?: unknown; leave?: unknown } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    /* empty */
  }
  const id = String(body.id ?? "");
  if (!/^[a-z0-9]{8,40}$/i.test(id)) return new Response("Bad id", { status: 400 });

  if (body.leave) {
    await q("here leave", (db) => db`DELETE FROM here WHERE id = ${id}`);
    return new Response(null, { status: 204 });
  }

  const who = visitorKey(req);
  // A tab beats every 15s; anything much faster is someone poking at the endpoint.
  if (!(await allow(`here:${who}`, 30, 60))) return Response.json({ here: null }, { status: 429 });

  const rows = await q("here", (db) =>
    db.transaction([
      db`INSERT INTO here (id, who, last_seen) VALUES (${id}, ${who}, now())
         ON CONFLICT (id) DO UPDATE SET last_seen = now(), who = EXCLUDED.who`,
      db`SELECT count(DISTINCT who)::int AS n FROM here WHERE last_seen > now() - ${WINDOW}::interval`,
    ]),
  );
  const n = (rows as unknown as { n: number }[][] | null)?.[1]?.[0]?.n ?? null;
  return Response.json({ here: n }, { headers: { "Cache-Control": "no-store" } });
}

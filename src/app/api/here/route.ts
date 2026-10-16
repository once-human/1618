import { q } from "@/lib/db";

/**
 * "N people here right now". Each open tab sends a random id every 30
 * seconds while it's visible; the count is the ids seen in the last 75
 * seconds. The id lives only in that tab's memory and means nothing outside
 * it: no cookie, nothing about who you are.
 */
export async function POST(req: Request) {
  let id = "";
  try {
    id = String(((await req.json()) as { id?: unknown }).id ?? "");
  } catch {
    /* empty */
  }
  if (!/^[a-z0-9]{8,32}$/i.test(id)) return new Response("Bad id", { status: 400 });
  const rows = await q<{ n: number }>("here", (db) =>
    db.transaction([
      db`INSERT INTO here (id, last_seen) VALUES (${id}, now()) ON CONFLICT (id) DO UPDATE SET last_seen = now()`,
      db`SELECT count(*)::int AS n FROM here WHERE last_seen > now() - interval '75 seconds'`,
    ]),
  );
  const n = (rows as unknown as { n: number }[][] | null)?.[1]?.[0]?.n ?? null;
  return Response.json({ here: n }, { headers: { "Cache-Control": "no-store" } });
}

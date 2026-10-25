import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { listVisits, summary, visitEvents } from "@/lib/visits/server";

/**
 * The visitor log, for /admin → privacy.
 *   ?hours=24&kind=person|bot|all   visits, newest first, with the summary
 *   ?visit=<id>                     everything that happened in one visit
 */
export async function GET(req: Request) {
  await connection();
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  const u = new URL(req.url).searchParams;
  const headers = { "Cache-Control": "no-store" };
  const visit = u.get("visit");
  if (visit) return Response.json({ events: await visitEvents(visit.slice(0, 120)) }, { headers });
  const hours = Number(u.get("hours")) || 24;
  const kind = u.get("kind") === "bot" ? "bot" : u.get("kind") === "all" ? "all" : "person";
  const [visits, sum] = await Promise.all([listVisits(hours, kind), summary()]);
  return Response.json({ visits, summary: sum }, { headers });
}

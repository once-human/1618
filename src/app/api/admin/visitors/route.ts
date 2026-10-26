import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { listPeople, listVisits, personVisits, summary, visitEvents } from "@/lib/visits/server";

/**
 * The visitor log, for /admin → privacy.
 *   ?hours=24&kind=person|bot|all   visits, newest first, with the summary
 *   ?hours=24&kind=people           one row per person (browser code), with the summary
 *   ?person=<id>                    every kept visit of one person
 *   ?visit=<id>                     everything that happened in one visit
 */
export async function GET(req: Request) {
  await connection();
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  const u = new URL(req.url).searchParams;
  const headers = { "Cache-Control": "no-store" };
  const visit = u.get("visit");
  if (visit) return Response.json({ events: await visitEvents(visit.slice(0, 120)) }, { headers });
  const person = u.get("person");
  if (person) return Response.json({ visits: await personVisits(person.slice(0, 64)) }, { headers });
  const hours = Number(u.get("hours")) || 24;
  if (u.get("kind") === "people") {
    const [people, sum] = await Promise.all([listPeople(hours), summary()]);
    return Response.json({ people, summary: sum }, { headers });
  }
  const kind = u.get("kind") === "bot" ? "bot" : u.get("kind") === "all" ? "all" : "person";
  const [visits, sum] = await Promise.all([listVisits(hours, kind), summary()]);
  return Response.json({ visits, summary: sum }, { headers });
}

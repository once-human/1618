import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { getArchive, getDay } from "@/lib/desk/server";

/** Admin: every archived day (totals), or one day's spans with ?day=YYYY-MM-DD. Never cached. */
export async function GET(req: Request) {
  await connection();
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  const day = new URL(req.url).searchParams.get("day");
  if (day) {
    const d = await getDay(day);
    return d ? Response.json(d) : new Response("No record for that day", { status: 404 });
  }
  return Response.json(await getArchive(), { headers: { "Cache-Control": "no-store" } });
}

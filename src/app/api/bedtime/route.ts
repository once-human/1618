import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { BED_HOURS, endBedtime, getBedtime, goToBed } from "@/lib/presence/bedtime";

/**
 * Going to bed, from the "Good Night" Shortcut ("Hey Siri, good night").
 *
 *   POST   /api/bedtime   Authorization: Bearer <ADMIN_SECRET>   → went to bed just now
 *   DELETE /api/bedtime   (same header)                          → I'm up, stop saying so
 *   GET    /api/bedtime                                          → tonight's bedtime, if it still counts
 *
 * The site shows it for five hours, then lets it go on its own. Each one is
 * kept in the history (the timeline's "Went to bed").
 */
export async function GET() {
  await connection();
  return Response.json({ bedtime: await getBedtime(), hours: BED_HOURS }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  const bedtime = await goToBed("siri");
  if (!bedtime) return Response.json({ ok: false, reason: "couldn't reach the database" }, { status: 503 });
  return Response.json({ ok: true, bedtime });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  return Response.json({ ok: true, ended: await endBedtime() });
}

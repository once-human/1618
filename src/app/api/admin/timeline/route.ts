import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { getTimelineFor } from "@/lib/history/timeline";

export const maxDuration = 60;

/** Admin: the timeline over a longer stretch (?days=30, up to 366). Not cached, not public. */
export async function GET(req: Request) {
  await connection();
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  const days = Number(new URL(req.url).searchParams.get("days")) || 30;
  return Response.json(await getTimelineFor(days), { headers: { "Cache-Control": "no-store" } });
}

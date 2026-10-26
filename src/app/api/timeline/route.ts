import { connection } from "next/server";
import { getTimeline } from "@/lib/history/timeline";

/** The last seven days across music, code, Pinterest, runs and workouts. */
export async function GET() {
  await connection();
  return Response.json(await getTimeline(), {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}

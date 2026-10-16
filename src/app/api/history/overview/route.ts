import { connection } from "next/server";
import { getOverview } from "@/lib/history/query";

/** Today, 7 days, this month, this year and all time, side by side. */
export async function GET() {
  await connection();
  return Response.json(await getOverview(), { headers: { "Cache-Control": "public, s-maxage=300" } });
}

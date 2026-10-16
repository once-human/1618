import { connection } from "next/server";
import { getReplay } from "@/lib/history/query";

/** The year so far, recap-style. Refreshed every few hours. */
export async function GET(req: Request) {
  await connection();
  const year = new URL(req.url).searchParams.get("year") ?? undefined;
  return Response.json(await getReplay(year), { headers: { "Cache-Control": "public, s-maxage=1800" } });
}

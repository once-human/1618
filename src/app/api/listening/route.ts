import { connection } from "next/server";
import { getListening } from "@/lib/presence/live";

/** This month's listening, for /now and the home page. */
export async function GET() {
  await connection();
  return Response.json(await getListening(), {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}

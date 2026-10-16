import { connection } from "next/server";
import { checkSources } from "@/lib/history/sources";

/** Health of every live source, for /status. */
export async function GET() {
  await connection();
  return Response.json(await checkSources(), { headers: { "Cache-Control": "public, s-maxage=30" } });
}

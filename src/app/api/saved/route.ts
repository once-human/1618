import { connection } from "next/server";
import { getSaved } from "@/lib/presence/pinterest";

/** My latest Pinterest saves. Cached for 10 minutes server-side, 5 at the edge. */
export async function GET() {
  await connection();
  return Response.json(await getSaved(), {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}

import { after, connection } from "next/server";
import { archivePins, getSaved } from "@/lib/presence/pinterest";

/** Bump when the Saved shape changes, so old cached copies aren't served. */
export const SAVED_SHAPE = 4;

/** My Pinterest. Cached 10 minutes server-side, 5 at the edge. Each fresh copy is archived. */
export async function GET() {
  await connection();
  const saved = await getSaved(SAVED_SHAPE);
  after(() => archivePins(saved.pins));
  return Response.json(saved, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}

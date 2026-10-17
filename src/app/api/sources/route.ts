import { connection } from "next/server";
import { checkSources } from "@/lib/history/sources";
import { checkFeatures } from "@/lib/features";

/** For /status: everything the site does, and the health of every live source behind it. */
export async function GET() {
  await connection();
  const [sources, features] = await Promise.all([checkSources(), checkFeatures().catch(() => [])]);
  return Response.json({ ...sources, features }, { headers: { "Cache-Control": "public, s-maxage=30" } });
}

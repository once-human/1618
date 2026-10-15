import { getPresence } from "@/lib/presence/server";

/** Live presence signals for the site. Each source is cached on its own schedule. */
export async function GET() {
  const presence = await getPresence();
  return Response.json(presence, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}

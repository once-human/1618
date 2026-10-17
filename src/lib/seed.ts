import "server-only";
import { cacheLife } from "next/cache";
import { SITE_URL } from "@/lib/site";

/**
 * A recent copy of one of the site's own live endpoints, for sending along
 * with a page. It reads the same answer visitors' browsers get (cached for
 * everyone), so sending data with pages adds no load on Last.fm and friends.
 */
export async function snapshot<T>(path: "/api/live" | "/api/listening" | "/api/saved", ttl: "live" | "slow"): Promise<T | null> {
  "use cache: remote";
  if (ttl === "live") cacheLife({ stale: 10, revalidate: 15, expire: 120 });
  else cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  try {
    const res = await fetch(`${SITE_URL}${path}`, { signal: AbortSignal.timeout(4000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

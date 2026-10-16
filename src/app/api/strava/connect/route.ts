import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { stravaConfigured } from "@/lib/history/strava";
import { SITE_URL } from "@/lib/site";

/** Step one of connecting Strava: send me to Strava to allow read access. Admin only. */
export async function GET(req: Request) {
  await connection();
  if (!isAdmin(req)) return new Response("Not allowed", { status: 401 });
  if (!stravaConfigured()) return new Response("Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET first.", { status: 400 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", `${SITE_URL}/api/strava/callback?key=${encodeURIComponent(key)}`);
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "read,activity:read");
  return Response.redirect(url.toString(), 302);
}

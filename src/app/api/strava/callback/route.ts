import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { stravaExchange } from "@/lib/history/strava";
import { runSync } from "@/lib/history/sync";

/** Step two: Strava sends me back with a code, which becomes a lasting token. */
export async function GET(req: Request) {
  await connection();
  if (!isAdmin(req)) return new Response("Not allowed", { status: 401 });
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return new Response("Strava didn't send a code. Try connecting again.", { status: 400 });
  const ok = await stravaExchange({ code });
  if (!ok) return new Response("Strava refused the code. Try connecting again.", { status: 502 });
  const report = await runSync({ force: true });
  return new Response(`Strava connected. Synced ${report.activities ?? 0} activities. You can close this tab.`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

import { connection } from "next/server";
import { q } from "@/lib/db";
import { runSync } from "@/lib/history/sync";
import { publishPreviousMonth } from "@/lib/presence/issues";

/**
 * Once a day (Vercel cron): a full sync, last month's issue frozen once the
 * month is over, and housekeeping of short-lived rows.
 */
export async function GET(req: Request) {
  await connection();
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response("Not allowed", { status: 401 });
  const sync = await runSync({ force: true });
  const issue = await publishPreviousMonth();
  await Promise.all([
    q("clean here", (db) => db`DELETE FROM here WHERE last_seen < now() - interval '1 day'`),
    q("clean ratelimit", (db) => db`DELETE FROM ratelimit WHERE window_start < now() - interval '2 days'`),
  ]);
  return Response.json({ sync, issue });
}
export const maxDuration = 120;

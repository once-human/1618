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
  // Yesterday's visitors become a plain number; their hashes are deleted.
  await q("fold visitors", (db) =>
    db.transaction([
      db`INSERT INTO counters (name, n) VALUES ('visitors_archived', (SELECT count(*) FROM visitors WHERE day < (now() AT TIME ZONE 'Asia/Kolkata')::date))
         ON CONFLICT (name) DO UPDATE SET n = counters.n + EXCLUDED.n`,
      db`DELETE FROM visitors WHERE day < (now() AT TIME ZONE 'Asia/Kolkata')::date`,
    ]),
  );
  await Promise.all([
    q("clean ratelimit", (db) => db`DELETE FROM ratelimit WHERE window_start < now() - interval '2 days'`),
  ]);
  return Response.json({ sync, issue });
}
export const maxDuration = 120;

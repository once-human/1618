import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { runSync } from "@/lib/history/sync";

/**
 * Pull new data into the history store. Anyone may call it (it only copies my
 * own public data, and runs at most every five minutes); with the admin key
 * or the cron secret it runs right away.
 */
export async function GET(req: Request) {
  await connection();
  const cron = process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const report = await runSync({ force: !!cron || isAdmin(req) });
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
export const POST = GET;
export const maxDuration = 120;

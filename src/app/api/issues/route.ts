import { connection } from "next/server";
import { listIssues } from "@/lib/presence/issues";

/** Every month in the history store, newest first. */
export async function GET() {
  await connection();
  return Response.json(await listIssues(), { headers: { "Cache-Control": "public, s-maxage=600" } });
}

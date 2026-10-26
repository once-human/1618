import { connection } from "next/server";
import { sleepInputs } from "@/lib/presence/sleepData";

export async function GET() {
  await connection();
  return Response.json(await sleepInputs(), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}

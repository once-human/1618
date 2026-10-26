import { connection } from "next/server";
import { getLive } from "@/lib/desk/server";

export async function GET() {
  await connection();
  return Response.json(await getLive(), { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } });
}

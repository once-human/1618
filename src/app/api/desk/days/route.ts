import { connection } from "next/server";
import { getDays } from "@/lib/desk/server";

export async function GET() {
  await connection();
  return Response.json(await getDays(), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}

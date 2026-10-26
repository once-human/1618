import { connection } from "next/server";
import { getDays } from "@/lib/desk/server";

export async function GET(req: Request) {
  await connection();
  const days = Number(new URL(req.url).searchParams.get("days")) || 7;
  return Response.json(await getDays(days), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}

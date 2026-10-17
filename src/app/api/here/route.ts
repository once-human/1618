import { connection } from "next/server";
import { deviceKey, OSES, screenOf, type Os } from "@/lib/presence/device";
import { geoOf } from "@/lib/geo";

/**
 * Hands a tab its device's code for the live "people here" count (see
 * src/lib/presence/device.ts), and its town. Nothing is looked up or kept.
 */
export async function POST(req: Request) {
  await connection();
  let body: { os?: unknown; w?: unknown; h?: unknown } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    /* empty */
  }
  const os: Os = OSES.includes(body.os as Os) ? (body.os as Os) : "other";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const key = deviceKey({
    ip,
    os,
    screen: screenOf(body.w, body.h),
    day,
    secret: process.env.HASH_SALT ?? "",
  });
  // The town is passed on to the others on the site ("someone in Berlin"); nothing finer.
  const { city, country } = geoOf(req);
  return Response.json({ key, day, city, country }, { headers: { "Cache-Control": "no-store" } });
}

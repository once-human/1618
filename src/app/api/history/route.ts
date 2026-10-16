import { connection } from "next/server";
import { cachedSummary, resolveRange } from "@/lib/history/query";

/**
 * Search the history store.
 *   /api/history?range=week
 *   /api/history?range=month&at=2026-09
 *   /api/history?range=year&at=2026
 *   /api/history?range=all
 *   /api/history?from=2026-08-01&to=2026-08-15
 */
export async function GET(req: Request) {
  await connection();
  const p = new URL(req.url).searchParams;
  let from: Date, to: Date, label: string;
  if (p.get("from") && p.get("to")) {
    from = new Date(`${p.get("from")}T00:00:00+05:30`);
    to = new Date(`${p.get("to")}T23:59:59+05:30`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from)
      return new Response("Bad dates", { status: 400 });
    label = `${p.get("from")} to ${p.get("to")}`;
  } else {
    const r = resolveRange(p.get("range") ?? "month", p.get("at"));
    if (!r) return new Response("range must be week, month, year or all", { status: 400 });
    ({ from, to, label } = r);
  }
  const summary = await cachedSummary(from.toISOString(), to.toISOString());
  return Response.json({ label, ...summary }, { headers: { "Cache-Control": "public, s-maxage=300" } });
}

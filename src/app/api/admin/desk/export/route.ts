import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { exportStream, type ExportKind } from "@/lib/desk/export";
import { RAW_DAYS } from "@/lib/desk/server";

export const maxDuration = 60;

/**
 * Admin: my laptop record as a file.
 *   /api/admin/desk/export?kind=spans|days|samples&format=csv|json&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(req: Request) {
  await connection();
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  const u = new URL(req.url).searchParams;
  const kind = (["spans", "days", "samples"].includes(u.get("kind") ?? "") ? u.get("kind") : "spans") as ExportKind;
  const format = kind === "samples" || u.get("format") === "json" ? "json" : "csv";
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const from = day.test(u.get("from") ?? "") ? u.get("from")! : kind === "samples" ? new Date(Date.now() + 5.5 * 3600_000 - RAW_DAYS * 86_400_000).toISOString().slice(0, 10) : "2020-01-01";
  const to = day.test(u.get("to") ?? "") ? u.get("to")! : today;
  return new Response(exportStream(kind, format, from, to), {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="laptop-${kind}-${from}-to-${to}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}

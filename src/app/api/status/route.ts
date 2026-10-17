import { connection } from "next/server";
import { isAdmin, kvDelete, kvSet } from "@/lib/db";
import { getStatus } from "@/lib/presence/server";
import type { ManualStatus } from "@/lib/presence/types";

/**
 * My status line, set from an iPhone Shortcut.
 *
 *   POST /api/status   Authorization: Bearer <ADMIN_SECRET>
 *        { "text": "at a café in Koregaon Park", "hours": 3 }
 *   DELETE /api/status (same header) clears it.
 *
 * It expires on its own (default 4 hours, at most 48), so a forgotten status
 * never lingers for days.
 */
export async function GET() {
  await connection();
  return Response.json({ status: await getStatus() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  // JSON from the Shortcut, or the form on /admin, or a query string.
  let body: { text?: unknown; hours?: unknown } = {};
  const type = req.headers.get("content-type") ?? "";
  const isForm = type.includes("form");
  try {
    if (isForm) {
      const f = await req.formData();
      body = { text: f.get("text"), hours: f.get("hours") };
    } else body = await req.json();
  } catch {
    const url = new URL(req.url);
    body = { text: url.searchParams.get("text"), hours: url.searchParams.get("hours") };
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 80) : "";
  if (!text) return new Response("Send { text }", { status: 400 });
  const hours = Math.min(48, Math.max(0.25, Number(body.hours) || 4));
  const now = Date.now();
  const status: ManualStatus = {
    text,
    setAt: new Date(now).toISOString(),
    until: new Date(now + hours * 3600_000).toISOString(),
  };
  await kvSet("status", status);
  if (isForm) {
    return Response.redirect(new URL("/admin", req.url), 303);
  }
  return Response.json({ ok: true, status });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  await kvDelete("status");
  return Response.json({ ok: true });
}

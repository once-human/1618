import { connection } from "next/server";
import { isAdmin, kvGet, kvSet } from "@/lib/db";

/**
 * Signed iPhone Shortcuts for feeding the site, downloadable from /admin.
 * They hold no secret: the site key is asked for when the shortcut is added.
 * Built by scripts/shortcuts/build.py, signed, then uploaded here (PUT, admin).
 */
const NAMES: Record<string, string> = { health: "1618 Health", location: "1618 Location", status: "1618 Status", goodnight: "Good Night", goodmorning: "Good Morning" };

export async function GET(_req: Request, ctx: RouteContext<"/api/shortcuts/[name]">) {
  await connection();
  const { name } = await ctx.params;
  if (!NAMES[name]) return new Response("Not found", { status: 404 });
  const file = await kvGet<{ b64: string }>(`shortcut:${name}`);
  if (!file) return new Response("Not uploaded yet", { status: 404 });
  return new Response(Buffer.from(file.value.b64, "base64"), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${NAMES[name]}.shortcut"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/shortcuts/[name]">) {
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  const { name } = await ctx.params;
  if (!NAMES[name]) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(await req.arrayBuffer());
  // Signed shortcuts are Apple Encrypted Archives; anything else would just fail on the phone.
  if (bytes.length < 1000 || bytes.length > 1_000_000 || bytes.subarray(0, 4).toString() !== "AEA1")
    return new Response("Not a signed shortcut", { status: 400 });
  await kvSet(`shortcut:${name}`, { b64: bytes.toString("base64"), size: bytes.length });
  return Response.json({ ok: true, size: bytes.length });
}

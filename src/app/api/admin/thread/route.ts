import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { readThreads, THREAD } from "@/lib/talk/server";

/** One conversation, in full, for /admin. */
export async function GET(req: Request) {
  await connection();
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!THREAD.test(id)) return Response.json({ ok: false }, { status: 404 });
  const t = (await readThreads([{ id, after: Number(url.searchParams.get("after")) || 0 }]))[id];
  return Response.json({ ok: !!t?.exists, ...t }, { headers: { "Cache-Control": "no-store" } });
}

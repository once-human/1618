import { connection } from "next/server";
import { deleteThread, isLive, postMessage, readThreads, renameThread, THREAD } from "@/lib/talk/server";

/**
 * Talk to me: the site's side. (For a terminal, see /api/talk/cli, or just
 * `curl -L -d "hi" onkaryaglewad.in/talk`.)
 *
 *   GET    /api/talk?t=<code>:<after>,<code>:<after>   is my phone on, and new messages in each chat
 *   POST   /api/talk { thread?, text, name?, page? }    write (no thread = start a new chat)
 *   PATCH  /api/talk { thread, name }                    rename yourself in a chat
 *   DELETE /api/talk?thread=<code>                       delete a chat for good
 *
 * A chat's code is the only key to it. Only the person holding it, and I, can read it.
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const want = (url.searchParams.get("t") ?? "")
    .split(",")
    .map((p) => p.split(":"))
    .map(([id, after]) => ({ id, after: Number(after) || 0 }))
    .filter((w) => THREAD.test(w.id));
  // The old single-chat form, for pages loaded before this changed.
  const one = url.searchParams.get("thread");
  if (one && THREAD.test(one)) want.push({ id: one, after: Number(url.searchParams.get("after")) || 0 });
  const [live, threads] = await Promise.all([isLive(), readThreads(want)]);
  return json({ live, threads, messages: one ? (threads[one]?.messages ?? []) : undefined });
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const r = await postMessage(req, await body(req), "site");
  return r.ok ? json(r) : json({ ok: false, reason: r.reason }, r.status);
}

export async function PATCH(req: Request) {
  const b = await body(req);
  const r = await renameThread(req, b.thread, b.name);
  return r.ok ? json(r) : json({ ok: false, reason: r.reason }, r.status);
}

export async function DELETE(req: Request) {
  const r = await deleteThread(req, new URL(req.url).searchParams.get("thread"));
  return r.ok ? json(r) : json({ ok: false, reason: r.reason }, r.status);
}

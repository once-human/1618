import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { runSync } from "@/lib/history/sync";

/**
 * GitHub webhook: when I push, GitHub tells the site straight away, so
 * "pushed to …" and the timeline don't wait for the next poll. Set up on a
 * repo with the secret in GITHUB_WEBHOOK_SECRET (content type JSON).
 */
export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 404 });
  const body = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return new Response("Bad signature", { status: 401 });
  if (req.headers.get("x-github-event") === "ping") return Response.json({ ok: true, pong: true });
  revalidateTag("github", { expire: 0 });
  after(() => runSync({ force: true }));
  return Response.json({ ok: true });
}

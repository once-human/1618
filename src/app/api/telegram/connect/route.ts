import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import { isAdmin, kvSet } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { telegramConfigured, tg, webhookSecret } from "@/lib/talk/telegram";

/**
 * From /admin: point the bot at this site, then open Telegram with a one-time
 * code. Pressing Start there makes that chat the one visitors' messages go to.
 */
export async function GET(req: Request) {
  await connection();
  if (!(await isAdmin(req))) return new Response("Not found", { status: 404 });
  if (!telegramConfigured()) return new Response("Add TELEGRAM_BOT_TOKEN in Vercel first, then redeploy.", { status: 400 });

  const bot = await tg<{ username: string }>("getMe", {});
  if (!bot) return new Response("Telegram didn't accept the bot token. Check TELEGRAM_BOT_TOKEN.", { status: 502 });
  const hooked = await tg("setWebhook", {
    url: `${SITE_URL}/api/telegram`,
    secret_token: webhookSecret(),
    allowed_updates: ["message"],
  });
  if (!hooked) return new Response("Telegram refused the webhook. Try again in a minute.", { status: 502 });

  const code = randomBytes(12).toString("hex");
  await kvSet("telegram:claim", { code, expires: Date.now() + 15 * 60_000 });
  return Response.redirect(`https://t.me/${bot.username}?start=${code}`, 302);
}

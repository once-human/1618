import "server-only";
import { createHmac } from "node:crypto";
import { kvGet } from "@/lib/db";
import { HERE_KEY, HERE_URL } from "@/lib/presence/here-config";

/**
 * "Talk to me": a visitor's message goes to my Telegram through a bot of my
 * own; I reply there, and the reply is pushed back to their screen.
 *
 * Needs TELEGRAM_BOT_TOKEN (from @BotFather). The chat it talks to is claimed
 * once from /admin with a one-time link, so nobody else can take over the bot.
 */

export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN;

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const d = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!d.ok) console.warn(`[telegram] ${method}: ${d.description}`);
    return d.ok ? (d.result ?? null) : null;
  } catch (e) {
    console.warn(`[telegram] ${method}: ${(e as Error).message}`);
    return null;
  }
}

/** Telegram sends this with every update, so the webhook knows it's really Telegram. */
export function webhookSecret(): string {
  return createHmac("sha256", process.env.ADMIN_SECRET ?? "unset").update("telegram-webhook").digest("hex").slice(0, 48);
}

export interface Owner {
  chatId: number;
  name: string;
}

export async function owner(): Promise<Owner | null> {
  return (await kvGet<Owner>("telegram:owner"))?.value ?? null;
}

/**
 * Push an event to whoever is listening on a realtime channel (here: the one
 * visitor in a conversation), through Supabase Realtime's broadcast API.
 */
export async function push(topic: string, event: string, payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${HERE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: HERE_KEY },
      body: JSON.stringify({ messages: [{ topic, event, payload, private: false }] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn(`[talk] push ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn(`[talk] push: ${(e as Error).message}`);
    return false;
  }
}

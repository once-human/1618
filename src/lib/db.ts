import "server-only";
import { createHash } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * The site's small Postgres database (Neon). It keeps what the live sources
 * forget: every pin I've saved, the song playing and since when, my status,
 * counters, and what visitors send. Everything here is optional: with no
 * DATABASE_URL, or if the database is unreachable, each feature quietly
 * steps back and the rest of the site carries on.
 */
let client: NeonQueryFunction<false, false> | null | undefined;

export function sql(): NeonQueryFunction<false, false> | null {
  if (client === undefined) client = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
  return client;
}

/** Run a query, logging and swallowing failures so a database hiccup never breaks a page. */
export async function q<T = Record<string, unknown>>(
  label: string,
  run: (db: NeonQueryFunction<false, false>) => Promise<unknown>,
): Promise<T[] | null> {
  const db = sql();
  if (!db) return null;
  try {
    return (await run(db)) as T[];
  } catch (e) {
    console.warn(`[db] ${label}: ${(e as Error).message}`);
    return null;
  }
}

/* ---- Small key/value store ---- */

export async function kvGet<T>(key: string): Promise<{ value: T; updatedAt: string } | null> {
  const rows = await q<{ value: T; updated_at: string }>("kv get", (db) =>
    db`SELECT value, updated_at FROM kv WHERE key = ${key}`,
  );
  const r = rows?.[0];
  return r ? { value: r.value, updatedAt: new Date(r.updated_at).toISOString() } : null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await q("kv set", (db) =>
    db`INSERT INTO kv (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
  );
}

export async function kvDelete(key: string): Promise<void> {
  await q("kv delete", (db) => db`DELETE FROM kv WHERE key = ${key}`);
}

/* ---- Visitors: one-way hashes for rate limits, never stored IPs ---- */

/**
 * A one-way, salted hash of the visitor's IP that changes every day. It only
 * exists to stop one person flooding a form; it can't be turned back into an
 * IP, and it can't follow anyone from one day to the next.
 */
export function visitorKey(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${process.env.HASH_SALT ?? ""}|${day}|${ip}`)
    .digest("base64url")
    .slice(0, 22);
}

/**
 * Allow `limit` actions per `windowSec` for a key. Returns true when allowed.
 * If the database is unavailable the action is refused, so a form can't be
 * abused while limits can't be checked.
 */
export async function allow(key: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await q<{ n: number }>("ratelimit", (db) =>
    db`INSERT INTO ratelimit (key, n, window_start) VALUES (${key}, 1, now())
       ON CONFLICT (key) DO UPDATE SET
         n = CASE WHEN ratelimit.window_start < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE ratelimit.n + 1 END,
         window_start = CASE WHEN ratelimit.window_start < now() - make_interval(secs => ${windowSec}) THEN now() ELSE ratelimit.window_start END
       RETURNING n`,
  );
  const n = rows?.[0]?.n;
  return typeof n === "number" && n <= limit;
}

/** Check a request carries the admin secret (header `Authorization: Bearer …` or `?key=`). */
export function isAdmin(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice(7) : new URL(req.url).searchParams.get("key");
  if (!key || key.length !== secret.length) return false;
  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

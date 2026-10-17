import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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

/* ---- Me: who's allowed to change things ---- */

/** The browser cookie that keeps me logged in to /admin. "__Host-" makes the browser refuse it unless it's secure and for this exact site. */
export const ADMIN_COOKIE = "__Host-1618-admin";
const SESSION_DAYS = 30;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const sign = (secret: string, exp: number, epoch: number) =>
  createHmac("sha256", secret).update(`admin-session|${exp}|${epoch}`).digest("base64url");

// "Log out everywhere" bumps this number; every login signed with an older one stops working.
let epochCache: { n: number; at: number } | null = null;
async function epoch(): Promise<number> {
  if (epochCache && Date.now() - epochCache.at < 20_000) return epochCache.n;
  const row = await kvGet<{ n: number }>("admin:epoch");
  epochCache = { n: row?.value.n ?? 0, at: Date.now() };
  return epochCache.n;
}
export async function logOutEverywhere(): Promise<void> {
  const n = (await epoch()) + 1;
  await kvSet("admin:epoch", { n });
  epochCache = { n, at: Date.now() };
}

/** Is this the site key? (Constant time, so it can't be guessed a letter at a time.) */
export function isSiteKey(key: string | null | undefined): boolean {
  const secret = process.env.ADMIN_SECRET;
  return !!secret && !!key && same(key, secret);
}

/** A login that lasts 30 days. It's a signature, not the key; changing the key, or "log out everywhere", ends it. */
export async function newSession(): Promise<{ value: string; maxAge: number }> {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  return { value: `${exp}.${sign(process.env.ADMIN_SECRET!, exp, await epoch())}`, maxAge: SESSION_DAYS * 86400 };
}

/** Checks a login cookie's value (for pages, which see cookies but not the request). */
export async function sessionValid(raw: string | undefined | null): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !raw) return false;
  const [exp, sig] = raw.split(".");
  return Number(exp) > Date.now() && !!sig && same(sig, sign(secret, Number(exp), await epoch()));
}

async function sessionOk(req: Request): Promise<boolean> {
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  if (!(await sessionValid(raw))) return false;
  // A logged-in browser only takes changes from this site's own pages (no forged forms from elsewhere).
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    const site = req.headers.get("sec-fetch-site");
    if (site ? site !== "same-origin" : !origin || new URL(origin).host !== new URL(req.url).host) return false;
  }
  return true;
}

/**
 * Is this me? Either my phone's shortcuts (header "Authorization: Bearer
 * <key>") or my browser, logged in at /admin. The key never goes in a URL,
 * where it would end up in history and logs.
 */
export async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return isSiteKey(auth.slice(7));
  return sessionOk(req);
}

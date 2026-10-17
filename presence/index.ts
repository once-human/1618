/**
 * Who's on onkaryaglewad.in right now.
 *
 * Every open tab holds one WebSocket here. A person is a browser: it keeps a
 * random id in local storage, so all its tabs count once, while a private
 * window or another device counts as someone else. Joining and leaving are
 * pushed to everyone the moment they happen; a tab that vanishes without
 * saying goodbye (a phone losing signal) stops answering pings and is dropped
 * within half a minute.
 *
 * Everything lives in memory. Nothing is written anywhere, and nothing here
 * can say who anyone is: the ids are random, and addresses are only held
 * while a socket is open, to stop one machine opening thousands of them.
 *
 * Runs as a single-file Railway Function on Bun. Tabs that can't open a
 * WebSocket (some corporate proxies) fall back to POST /beat every 10s.
 */
import type { ServerWebSocket } from "bun";

const PORT = Number(Bun.env.PORT ?? 3000);
const ORIGIN_OK = new RegExp(
  Bun.env.ORIGINS ?? "^(https://(www\\.)?onkaryaglewad\\.in|https://[a-z0-9-]+\\.vercel\\.app|http://localhost:\\d+)$",
);
const ID = /^[A-Za-z0-9_-]{8,48}$/;
const PER_IP = 48; // a family or office behind one address, with a few tabs each
const MAX_TABS = 20_000;
const BEAT_TTL = 30_000; // fallback tabs beat every 10s

interface Conn {
  b: string;
  t: string;
  ip: string;
  last?: string;
}
type WS = ServerWebSocket<Conn>;

/** tab key ("browser:tab") → its socket, or the time a fallback tab expires */
const tabs = new Map<string, { b: string; ip: string; ws?: WS; until?: number }>();
const browsers = new Map<string, number>(); // browser → open tabs
const perIp = new Map<string, number>();

const sockets = new Set<WS>();

function add(key: string, b: string, ip: string, ws?: WS, until?: number) {
  const had = tabs.get(key);
  if (had) {
    // Same tab again: a refresh racing its own goodbye, or a fallback tab
    // upgrading to a socket. Keep one entry; close the older socket.
    // Record the new one first: closing the old socket runs its close
    // handler straight away, and it must see it's no longer the current one.
    tabs.set(key, { b, ip: had.ip, ws, until });
    if (had.ws && had.ws !== ws) {
      sockets.delete(had.ws);
      had.ws.close(4000, "replaced");
    }
    return;
  }
  tabs.set(key, { b, ip, ws, until });
  browsers.set(b, (browsers.get(b) ?? 0) + 1);
  perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
}

function remove(key: string) {
  const had = tabs.get(key);
  if (!had) return false;
  tabs.delete(key);
  const n = (browsers.get(had.b) ?? 1) - 1;
  if (n > 0) browsers.set(had.b, n);
  else browsers.delete(had.b);
  const m = (perIp.get(had.ip) ?? 1) - 1;
  if (m > 0) perIp.set(had.ip, m);
  else perIp.delete(had.ip);
  return true;
}

/** People, tabs, and how many of those tabs are yours. */
const stateFor = (b: string) => `{"n":${browsers.size},"t":${tabs.size},"y":${browsers.get(b) ?? 0}}`;

// Changes are gathered for a moment and sent once: ten tabs opening at once
// is one update, not ten.
let pending: ReturnType<typeof setTimeout> | null = null;
function changed() {
  pending ??= setTimeout(() => {
    pending = null;
    for (const ws of sockets) send(ws);
  }, 40);
}
function send(ws: WS) {
  const s = stateFor(ws.data.b);
  if (s === ws.data.last) return;
  ws.data.last = s;
  ws.send(s);
}

// Fallback tabs that stop beating are let go.
setInterval(() => {
  const now = Date.now();
  let gone = false;
  for (const [key, tab] of tabs) if (!tab.ws && tab.until! < now) gone = remove(key) || gone;
  if (gone) changed();
}, 5_000);

function ipOf(req: Request, server: Bun.Server) {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    server.requestIP(req)?.address ??
    "?"
  );
}

function cors(origin: string | null): Record<string, string> {
  return origin && ORIGIN_OK.test(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "content-type", Vary: "Origin" }
    : {};
}

const json = (body: unknown, origin: string | null, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...cors(origin) },
  });

Bun.serve<Conn, undefined>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");

    if (url.pathname === "/health") return json({ ok: true, people: browsers.size, tabs: tabs.size }, origin);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === "/count") return json({ n: browsers.size, t: tabs.size }, origin);

    if (origin && !ORIGIN_OK.test(origin)) return new Response("Not from the site", { status: 403 });
    const ip = ipOf(req, server);

    if (url.pathname === "/ws") {
      const b = url.searchParams.get("b") ?? "";
      const t = url.searchParams.get("t") ?? "";
      if (!ID.test(b) || !ID.test(t)) return new Response("Bad id", { status: 400 });
      if (!origin) return new Response("Not from the site", { status: 403 });
      if ((perIp.get(ip) ?? 0) >= PER_IP || tabs.size >= MAX_TABS) return new Response("Too many", { status: 429 });
      if (server.upgrade(req, { data: { b, t, ip } })) return undefined;
      return new Response("Expected a WebSocket", { status: 426 });
    }

    if (url.pathname === "/beat" && req.method === "POST") {
      let body: { b?: unknown; t?: unknown; leave?: unknown } = {};
      try {
        body = JSON.parse(await req.text());
      } catch {
        /* empty */
      }
      const b = String(body.b ?? "");
      const t = String(body.t ?? "");
      if (!ID.test(b) || !ID.test(t)) return json({ error: "bad id" }, origin, 400);
      const key = `${b}:${t}`;
      if (body.leave) {
        const tab = tabs.get(key);
        if (tab && !tab.ws && remove(key)) changed();
        return new Response(null, { status: 204, headers: cors(origin) });
      }
      const known = tabs.has(key);
      if (!known && ((perIp.get(ip) ?? 0) >= PER_IP || tabs.size >= MAX_TABS)) return json({ error: "too many" }, origin, 429);
      if (!tabs.get(key)?.ws) add(key, b, ip, undefined, Date.now() + BEAT_TTL);
      if (!known) changed();
      return json(JSON.parse(stateFor(b)), origin);
    }

    return new Response("Who's here on onkaryaglewad.in. Nothing to see.", { status: 404 });
  },
  websocket: {
    // Bun pings quiet sockets and closes any that don't answer, so a tab
    // that disappears without a goodbye is gone within ~30s.
    idleTimeout: 30,
    sendPings: true,
    maxPayloadLength: 256,
    open(ws) {
      sockets.add(ws);
      add(`${ws.data.b}:${ws.data.t}`, ws.data.b, ws.data.ip, ws);
      send(ws);
      changed();
    },
    message(ws) {
      // The page asks "still there?" now and then, so it can notice a dead
      // connection that never closed. Answer with the current state.
      ws.data.last = undefined;
      send(ws);
    },
    close(ws) {
      sockets.delete(ws);
      const key = `${ws.data.b}:${ws.data.t}`;
      if (tabs.get(key)?.ws === ws && remove(key)) changed();
    },
  },
});

console.log(`here: listening on ${PORT}`);

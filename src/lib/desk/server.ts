import { kvGet, kvSet, q } from "@/lib/db";
import { recent } from "./recent";
import { GAP_MS, buildSpans, cleanSample, doingKey, live, rollup, type DayRollup, type Live, type Sample, type Span } from "./model";

const DAY_MS = 86_400_000;
const IST = 5.5 * 3600_000;
const dayOf = (iso: string) => new Date(Date.parse(iso) + IST).toISOString().slice(0, 10);

/** Cleans and stores a batch from the agent; the newest sample becomes the live state. Returns how many were kept. */
export async function ingest(body: unknown): Promise<number> {
  const raw = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as { samples?: unknown }).samples) ? (body as { samples: unknown[] }).samples : [body];
  const now = Date.now();
  // How long until the agent's next upload (it sends in batches); 0 when it is stopping.
  const nextS = body && typeof body === "object" && !Array.isArray(body) && Number.isFinite((body as { next_s?: unknown }).next_s) ? Math.max(0, Math.min(3600, Number((body as { next_s: number }).next_s))) : 0;
  const samples = raw
    .slice(0, 500)
    .map(cleanSample)
    .filter((s): s is Sample => !!s && Date.parse(s.t) < now + 5 * 60_000 && Date.parse(s.t) > now - 8 * DAY_MS)
    .sort((a, b) => a.t.localeCompare(b.t));
  if (!samples.length) return 0;
  await q("desk insert", (db) =>
    db.transaction(samples.map((s) => db`INSERT INTO desk_samples (at, data) VALUES (${s.t}, ${JSON.stringify(s)}::jsonb) ON CONFLICT (at) DO UPDATE SET data = EXCLUDED.data`)),
  );
  const last = samples[samples.length - 1];
  const cur = await kvGet<Sample>("desk:last");
  if (!cur || cur.value.t <= last.t) {
    await kvSet("desk:last", last);
    // How long I've been on the same thing: walk back through this batch, then the stored start.
    const key = doingKey(last);
    let at = last.t;
    for (let i = samples.length - 1; i >= 0 && doingKey(samples[i]) === key && (i === samples.length - 1 || Date.parse(samples[i + 1].t) - Date.parse(samples[i].t) <= GAP_MS); i--) at = samples[i].t;
    const prev = await kvGet<{ key: string; at: string }>("desk:since");
    const joined = at === samples[0].t && cur && doingKey(cur.value) === key && Date.parse(at) - Date.parse(cur.value.t) <= GAP_MS && prev?.value.key === key;
    await kvSet("desk:since", { key, at: joined ? prev!.value.at : at });
    // Between uploads it is still there; a final upload (next_s 0) clears that.
    await kvSet("desk:expect", nextS > 0 ? new Date(now + (nextS + 120) * 1000).toISOString() : null);
  }
  const act = [...samples].reverse().find((s) => s.active);
  if (act) {
    const prev = await kvGet<string>("desk:active");
    if (!prev || prev.value < act.t) await kvSet("desk:active", act.t);
  }
  return samples.length;
}

export async function getLive(): Promise<Live> {
  // The agent uploads in batches, so the newest samples can be a few minutes behind: read a longer stretch.
  const since = new Date(Date.now() - 40 * 60_000).toISOString();
  const [row, act, doingSince, expect, rows] = await Promise.all([
    kvGet<Sample>("desk:last"),
    kvGet<string>("desk:active"),
    kvGet<{ key: string; at: string }>("desk:since"),
    kvGet<string | null>("desk:expect"),
    q<{ data: Sample }>("desk recent", (db) => db`SELECT data FROM desk_samples WHERE at >= ${since} ORDER BY at`),
  ]);
  const now = Date.now();
  const l = live(row?.value ?? null, now, act?.value ?? null, doingSince?.value ?? null, expect?.value ?? null);
  // "Recent" is read as of the newest sample: between uploads that is the last thing the agent told us.
  const lastMs = row?.value ? Date.parse(row.value.t) : now;
  return { ...l, recent: l.online ? recent((rows ?? []).map((r) => r.data), Math.min(now, lastMs + 60_000)) : null };
}

/** Raw 30-second samples are kept this long: my admin sees them in full. */
export const RAW_DAYS = 30;
/** The public site shows this many days. */
export const PUBLIC_DAYS = 7;

const istMidnight = (ms: number) => Math.floor((ms + IST) / DAY_MS) * DAY_MS - IST;

/** A span as stored in the long-term record: [lane, kind, label, detail, start, end] (about 110 bytes). */
export type StoredSpan = [Span["lane"], string, string, string | null, string, string];
const pack = (s: Span): StoredSpan => [s.lane, s.kind, s.label, s.detail, s.start.slice(0, 19) + "Z", s.end.slice(0, 19) + "Z"];
export const unpack = (t: StoredSpan): Span => ({ lane: t[0], kind: t[1], label: t[2], detail: t[3], start: t[4], end: t[5] });

/** What a finished day keeps for good: the totals, and every span. */
export type DayRecord = DayRollup & { spans: StoredSpan[]; n: number };

export interface DeskDays {
  /** Detailed spans for the last 7 days (IST day, oldest first). */
  days: { day: string; spans: Span[]; summary: DayRollup }[];
  /** Older days, compact. Empty on the public site: it only shows the last seven days. */
  older: { day: string; summary: DayRollup }[];
}

/** The public view: the last seven days. Filed days come from the archive, today and yesterday from raw samples. */
export async function getDays(): Promise<DeskDays> {
  const fromDay = dayOf(new Date(Date.now() - (PUBLIC_DAYS - 1) * DAY_MS).toISOString());
  const arch = await q<{ day: string; data: DayRecord }>("desk archive read", (db) => db`SELECT day::text AS day, data FROM desk_days WHERE day >= ${fromDay} AND data ? 'spans' ORDER BY day`);
  const days: DeskDays["days"] = (arch ?? []).map(({ day, data }) => {
    const { spans, n: _n, ...summary } = data;
    void _n;
    return { day, spans: spans.map(unpack), summary };
  });
  const last = days[days.length - 1]?.day;
  const rawFrom = new Date(last ? Date.parse(`${last}T00:00:00Z`) - IST + DAY_MS : Date.parse(`${fromDay}T00:00:00Z`) - IST).toISOString();
  const rows = await q<{ data: Sample }>("desk read", (db) => db`SELECT data - 'sys' - 'battery' AS data FROM desk_samples WHERE at >= ${rawFrom} ORDER BY at`);
  const by = new Map<string, Sample[]>();
  for (const r of rows ?? []) (by.get(dayOf(r.data.t)) ?? by.set(dayOf(r.data.t), []).get(dayOf(r.data.t))!).push(r.data);
  for (const [day, ss] of [...by].sort(([x], [y]) => x.localeCompare(y))) {
    const spans = buildSpans(ss);
    days.push({ day, spans, summary: rollup(spans) });
  }
  return { days, older: [] };
}

/**
 * Daily (cron): every finished day gets its spans and totals written to desk_days, kept for good
 * (about 40 KB a day). Raw samples stay for RAW_DAYS so I can see everything, then go.
 */
export async function foldDesk(): Promise<{ archived: number; dropped: number }> {
  // A day is final two hours after it ends (uploads come in batches).
  const finalBefore = istMidnight(Date.now() - 2 * 3600_000);
  const finalIso = new Date(finalBefore).toISOString();
  const [have, counts] = await Promise.all([
    q<{ day: string; n: number | null }>("desk archive have", (db) => db`SELECT day::text AS day, (data->>'n')::int AS n FROM desk_days`),
    q<{ day: string; n: number }>("desk archive counts", (db) =>
      db`SELECT to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, count(*)::int AS n FROM desk_samples WHERE at < ${finalIso} GROUP BY 1 ORDER BY 1`,
    ),
  ]);
  const stored = new Map((have ?? []).map((r) => [r.day, r.n]));
  // New days, and days whose count changed (an offline queue delivered late).
  const todo = (counts ?? []).filter((c) => stored.get(c.day) !== c.n).slice(0, 8);
  let archived = 0;
  for (const c of todo) {
    const from = new Date(Date.parse(`${c.day}T00:00:00Z`) - IST).toISOString();
    const to = new Date(Date.parse(`${c.day}T00:00:00Z`) - IST + DAY_MS).toISOString();
    const rows = await q<{ data: Sample }>("desk archive day", (db) => db`SELECT data FROM desk_samples WHERE at >= ${from} AND at < ${to} ORDER BY at`);
    if (!rows?.length) continue;
    const spans = buildSpans(rows.map((r) => r.data));
    const rec: DayRecord = { ...rollup(spans), spans: spans.map(pack), n: rows.length };
    await q("desk archive write", (db) => db`INSERT INTO desk_days (day, data) VALUES (${c.day}, ${JSON.stringify(rec)}::jsonb) ON CONFLICT (day) DO UPDATE SET data = EXCLUDED.data`);
    archived++;
  }
  // Raw samples older than RAW_DAYS go, but only days that are safely archived.
  const cutoff = new Date(Math.min(istMidnight(Date.now() - RAW_DAYS * DAY_MS), finalBefore)).toISOString();
  const keepDays = new Set((await q<{ day: string }>("desk archive check", (db) => db`SELECT day::text AS day FROM desk_days`))?.map((r) => r.day) ?? []);
  const unarchived = (counts ?? []).filter((c) => c.day < dayOf(cutoff) && !keepDays.has(c.day));
  const dropped = unarchived.length
    ? 0
    : ((await q<{ n: number }>("desk drop raw", (db) => db`WITH gone AS (DELETE FROM desk_samples WHERE at < ${cutoff} RETURNING 1) SELECT count(*)::int AS n FROM gone`))?.[0]?.n ?? 0);
  return { archived, dropped };
}

/* ---- Admin: the whole record ---- */

export interface ArchiveDay {
  day: string;
  summary: DayRollup;
  spans: number;
  /** Raw samples still held for the day (0 once they are older than RAW_DAYS). */
  raw: boolean;
}

/** Every archived day (newest first) plus how much is held. */
export async function getArchive(): Promise<{ days: ArchiveDay[]; samples: { n: number; since: string | null; mb: number }; archiveMb: number; rawDays: number }> {
  const [days, st, size] = await Promise.all([
    q<{ day: string; data: DayRecord; spans: number }>("archive days", (db) => db`SELECT day::text AS day, data - 'spans' AS data, jsonb_array_length(coalesce(data->'spans', '[]'::jsonb)) AS spans FROM desk_days ORDER BY day DESC`),
    q<{ n: number; since: string | null }>("archive raw", (db) => db`SELECT count(*)::int AS n, min(at) AS since FROM desk_samples`),
    q<{ raw: string; arch: string }>("archive size", (db) => db`SELECT pg_total_relation_size('desk_samples')::text AS raw, pg_total_relation_size('desk_days')::text AS arch`),
  ]);
  const since = st?.[0]?.since ? new Date(st[0].since).toISOString() : null;
  const rawFrom = since ? dayOf(since) : "9999";
  return {
    days: (days ?? []).map((d) => ({ day: d.day, summary: d.data as unknown as DayRollup, spans: d.spans, raw: d.day >= rawFrom })),
    samples: { n: st?.[0]?.n ?? 0, since, mb: Math.round((Number(size?.[0]?.raw ?? 0) / 1048576) * 10) / 10 },
    archiveMb: Math.round((Number(size?.[0]?.arch ?? 0) / 1048576) * 10) / 10,
    rawDays: RAW_DAYS,
  };
}

/** One day's spans: from the archive when it is there, otherwise built from the raw samples (today, yesterday). */
export async function getDay(day: string): Promise<{ day: string; spans: Span[]; summary: DayRollup } | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - IST).toISOString();
  const to = new Date(Date.parse(`${day}T00:00:00Z`) - IST + DAY_MS).toISOString();
  const [arch, rows] = await Promise.all([
    q<{ data: DayRecord }>("day archive", (db) => db`SELECT data FROM desk_days WHERE day = ${day}`),
    q<{ data: Sample }>("day raw", (db) => db`SELECT data FROM desk_samples WHERE at >= ${from} AND at < ${to} ORDER BY at`),
  ]);
  // Raw wins when it has more (a day still being written); otherwise the archive.
  if (rows?.length && (!arch?.[0] || rows.length >= (arch[0].data.n ?? 0))) {
    const spans = buildSpans(rows.map((r) => r.data));
    return { day, spans, summary: rollup(spans) };
  }
  if (arch?.[0]) {
    const { spans, n: _n, ...summary } = arch[0].data;
    void _n;
    return { day, spans: spans.map(unpack), summary };
  }
  return null;
}

/**
 * Spans for the timeline over a stretch: finished days come from the archive (small), and only the days
 * not filed yet (today and yesterday) are built from raw samples, so a week costs about what two days did.
 */
export async function spansBetween(fromMs: number, toMs: number): Promise<Span[]> {
  const fromDay = dayOf(new Date(fromMs).toISOString());
  const arch = await q<{ day: string; spans: StoredSpan[] }>("spans archive", (db) =>
    db`SELECT day::text AS day, data->'spans' AS spans FROM desk_days WHERE day >= ${fromDay} AND data ? 'spans' ORDER BY day`,
  );
  const out: Span[] = [];
  let lastDay = "";
  for (const d of arch ?? []) {
    lastDay = d.day;
    for (const t of d.spans ?? []) out.push(unpack(t));
  }
  // Raw samples start the day after the newest archived day.
  const rawFrom = lastDay ? Math.max(fromMs, Date.parse(`${lastDay}T00:00:00Z`) - IST + DAY_MS) : fromMs;
  if (rawFrom < toMs) {
    const rows = await q<{ data: Sample }>("spans raw", (db) => db`SELECT data - 'sys' - 'battery' AS data FROM desk_samples WHERE at >= ${new Date(rawFrom).toISOString()} ORDER BY at`);
    out.push(...buildSpans((rows ?? []).map((r) => r.data)));
  }
  return out.filter((s) => Date.parse(s.end) >= fromMs && Date.parse(s.start) <= toMs).sort((a, b) => a.start.localeCompare(b.start));
}

import { kvGet, kvSet, q } from "@/lib/db";
import { GAP_MS, buildSpans, cleanSample, doingKey, live, rollup, type DayRollup, type Live, type Sample, type Span } from "./model";

const DAY_MS = 86_400_000;
const IST = 5.5 * 3600_000;
const dayOf = (iso: string) => new Date(Date.parse(iso) + IST).toISOString().slice(0, 10);

/** Cleans and stores a batch from the agent; the newest sample becomes the live state. Returns how many were kept. */
export async function ingest(body: unknown): Promise<number> {
  const raw = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as { samples?: unknown }).samples) ? (body as { samples: unknown[] }).samples : [body];
  const now = Date.now();
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
  }
  const act = [...samples].reverse().find((s) => s.active);
  if (act) {
    const prev = await kvGet<string>("desk:active");
    if (!prev || prev.value < act.t) await kvSet("desk:active", act.t);
  }
  return samples.length;
}

export async function getLive(): Promise<Live> {
  const [row, act, since] = await Promise.all([kvGet<Sample>("desk:last"), kvGet<string>("desk:active"), kvGet<{ key: string; at: string }>("desk:since")]);
  return live(row?.value ?? null, Date.now(), act?.value ?? null, since?.value ?? null);
}

export interface DeskDays {
  /** Detailed spans for the last 7 days (IST day, oldest first). */
  days: { day: string; spans: Span[]; summary: DayRollup }[];
  /** Older days, compact. */
  older: { day: string; summary: DayRollup }[];
}

export async function getDays(): Promise<DeskDays> {
  const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const [rows, old] = await Promise.all([
    q<{ data: Sample }>("desk read", (db) => db`SELECT data FROM desk_samples WHERE at >= ${since} ORDER BY at`),
    q<{ day: string; data: DayRollup }>("desk older", (db) => db`SELECT day::text AS day, data FROM desk_days ORDER BY day DESC LIMIT 400`),
  ]);
  const by = new Map<string, Sample[]>();
  for (const r of rows ?? []) (by.get(dayOf(r.data.t)) ?? by.set(dayOf(r.data.t), []).get(dayOf(r.data.t))!).push(r.data);
  const days = [...by]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, ss]) => {
      const spans = buildSpans(ss);
      return { day, spans, summary: rollup(spans) };
    });
  return { days, older: (old ?? []).map((o) => ({ day: o.day, summary: o.data })) };
}

/** Daily: samples older than 7 days become one rollup per day, then go. */
export async function foldDesk(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const rows = await q<{ data: Sample }>("desk old", (db) => db`SELECT data FROM desk_samples WHERE at < ${cutoff} ORDER BY at`);
  if (!rows?.length) return 0;
  const by = new Map<string, Sample[]>();
  for (const r of rows) (by.get(dayOf(r.data.t)) ?? by.set(dayOf(r.data.t), []).get(dayOf(r.data.t))!).push(r.data);
  const stmts = [...by].map(([day, ss]) => ({ day, data: rollup(buildSpans(ss)) }));
  await q("desk fold", (db) =>
    db.transaction([
      ...stmts.map((s) => db`INSERT INTO desk_days (day, data) VALUES (${s.day}, ${JSON.stringify(s.data)}::jsonb) ON CONFLICT (day) DO NOTHING`),
      db`DELETE FROM desk_samples WHERE at < ${cutoff}`,
    ]),
  );
  return rows.length;
}

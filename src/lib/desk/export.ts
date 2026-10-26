import "server-only";
import { q } from "@/lib/db";
import { getDay, unpack, type StoredSpan } from "./server";
import type { Sample } from "./model";

const DAY_MS = 86_400_000;
const IST = 5.5 * 3600_000;
const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export type ExportKind = "spans" | "days" | "samples";

/**
 * My own record, as a file. Streamed, because a year of spans is bigger than a
 * serverless response is allowed to be in one piece.
 *   spans:   every span of every day (CSV or JSON), kept for good
 *   days:    one line of totals per day (CSV or JSON)
 *   samples: the raw 30-second samples still held (JSON), the last 30 days
 */
export function exportStream(kind: ExportKind, format: "csv" | "json", from: string, to: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(c) {
      const put = (s: string) => c.enqueue(enc.encode(s));
      try {
        if (kind === "samples") {
          put("[");
          let first = true;
          const start = Date.parse(`${from}T00:00:00Z`);
          const end = Date.parse(`${to}T00:00:00Z`);
          for (let t = start; t <= end; t += DAY_MS) {
            const a = new Date(t - IST).toISOString();
            const b = new Date(t - IST + DAY_MS).toISOString();
            const rows = await q<{ data: Sample }>("export samples", (db) => db`SELECT data FROM desk_samples WHERE at >= ${a} AND at < ${b} ORDER BY at`);
            for (const r of rows ?? []) {
              put(`${first ? "\n" : ",\n"}${JSON.stringify(r.data)}`);
              first = false;
            }
          }
          put("\n]\n");
        } else if (kind === "days") {
          const rows = (await q<{ day: string; data: Record<string, unknown> }>("export days", (db) => db`SELECT day::text AS day, data - 'spans' AS data FROM desk_days WHERE day >= ${from} AND day <= ${to} ORDER BY day`)) ?? [];
          if (format === "json") put(JSON.stringify(rows.map((r) => ({ day: r.day, ...r.data })), null, 1));
          else {
            put("day,active_min,idle_min,claude_min,youtube_min,first,last,top_repo,top_kind\n");
            for (const r of rows) {
              const d = r.data as { activeMin?: number; idleMin?: number; claudeMin?: number; youtubeMin?: number; first?: string; last?: string; repos?: { name: string }[]; byKind?: Record<string, number> };
              const top = Object.entries(d.byKind ?? {}).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
              put([r.day, d.activeMin, d.idleMin, d.claudeMin, d.youtubeMin, d.first, d.last, d.repos?.[0]?.name, top].map(csv).join(",") + "\n");
            }
          }
        } else {
          if (format === "csv") put("day,start,end,minutes,lane,kind,label,detail\n");
          else put("[");
          let first = true;
          const emit = (day: string, t: StoredSpan) => {
            const sp = unpack(t);
            if (format === "csv") {
              const mins = Math.round((Date.parse(sp.end) - Date.parse(sp.start)) / 600) / 100;
              put([day, sp.start, sp.end, mins, sp.lane, sp.kind, sp.label, sp.detail].map(csv).join(",") + "\n");
            } else {
              put(`${first ? "\n" : ",\n"}${JSON.stringify({ day, ...sp })}`);
              first = false;
            }
          };
          // Archived days, a month at a time.
          const done = new Set<string>();
          const oldest = (await q<{ day: string | null }>("export oldest", (db) => db`SELECT min(day)::text AS day FROM desk_days`))?.[0]?.day;
          for (let t = Date.parse(`${oldest && oldest > from ? oldest : from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 31 * DAY_MS) {
            const a = new Date(t).toISOString().slice(0, 10);
            const b = new Date(Math.min(t + 30 * DAY_MS, Date.parse(`${to}T00:00:00Z`))).toISOString().slice(0, 10);
            const rows = (await q<{ day: string; spans: StoredSpan[] }>("export spans", (db) => db`SELECT day::text AS day, data->'spans' AS spans FROM desk_days WHERE day >= ${a} AND day <= ${b} ORDER BY day`)) ?? [];
            for (const r of rows) {
              done.add(r.day);
              for (const s of r.spans ?? []) emit(r.day, s);
            }
          }
          // Days not archived yet (today, yesterday): from the raw samples.
          const raw = (await q<{ day: string }>("export raw days", (db) => db`SELECT DISTINCT to_char(at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day FROM desk_samples ORDER BY 1`)) ?? [];
          for (const r of raw) {
            if (done.has(r.day) || r.day < from || r.day > to) continue;
            const d = await getDay(r.day);
            for (const s of d?.spans ?? []) emit(r.day, [s.lane, s.kind, s.label, s.detail, s.start, s.end]);
          }
          if (format === "json") put("\n]\n");
        }
        c.close();
      } catch (e) {
        c.error(e);
      }
    },
  });
}

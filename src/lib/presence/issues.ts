import "server-only";
import { cacheLife } from "next/cache";
import { q } from "@/lib/db";
import { summarise, type RangeSummary } from "@/lib/history/query";

/**
 * The monthly issue: one page per month of what I played, saved, built and
 * ran, read from the history store. Finished months are written once and
 * never change; the current month is built live and labelled "so far".
 */

const OFFSET = 5.5 * 3600_000;

export interface Issue {
  /** "2026-10" */
  month: string;
  label: string;
  complete: boolean;
  summary: RangeSummary;
  generatedAt: string;
}

export const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export const currentMonth = () => new Date(Date.now() + OFFSET).toISOString().slice(0, 7);

export const previousMonth = (m: string) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

function bounds(m: string): [Date, Date] {
  const start = new Date(Date.parse(`${m}-01T00:00:00Z`) - OFFSET);
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return [start, new Date(d.getTime() - OFFSET)];
}

export async function buildIssue(m: string): Promise<Issue> {
  const [from, to] = bounds(m);
  const summary = await summarise(from, new Date(Math.min(to.getTime(), Date.now())));
  return { month: m, label: monthLabel(m), complete: Date.now() >= to.getTime(), summary, generatedAt: new Date().toISOString() };
}

async function liveIssue(m: string): Promise<Issue> {
  "use cache: remote";
  cacheLife({ stale: 600, revalidate: 3600, expire: 6 * 3600 });
  return buildIssue(m);
}

/** One issue: finished months from the database (written once), this month live. */
export async function getIssue(m: string): Promise<Issue | null> {
  if (!/^\d{4}-\d{2}$/.test(m) || m > currentMonth()) return null;
  if (m === currentMonth()) return liveIssue(m);
  const rows = await q<{ data: Issue }>("issue read", (db) => db`SELECT data FROM issues WHERE month = ${m}`);
  if (rows?.[0]) return rows[0].data;
  // Not written yet (or written before the store had the data): build it now.
  const built = await buildIssue(m);
  if (built.summary.music.plays || built.summary.pins.count || built.summary.code.pushes) {
    await q("issue write", (db) =>
      db`INSERT INTO issues (month, data) VALUES (${m}, ${JSON.stringify(built)}::jsonb) ON CONFLICT (month) DO NOTHING`,
    );
    return built;
  }
  return null;
}

/** Every month with anything in the store, newest first. */
export async function listIssues(): Promise<{ month: string; label: string; complete: boolean; plays: number }[]> {
  const rows = await q<{ month: string; plays: number }>("issues list", (db) =>
    db`SELECT to_char(to_timestamp(uts) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month, count(*)::int AS plays
       FROM scrobbles GROUP BY month ORDER BY month DESC`,
  );
  const cur = currentMonth();
  const list = (rows ?? []).map((r) => ({ month: r.month, label: monthLabel(r.month), complete: r.month !== cur, plays: r.plays }));
  if (!list.some((r) => r.month === cur)) list.unshift({ month: cur, label: monthLabel(cur), complete: false, plays: 0 });
  return list;
}

/** Freeze last month's issue once it's over. Called by the daily job. */
export async function publishPreviousMonth(): Promise<string | null> {
  const m = previousMonth(currentMonth());
  const exists = await q<{ month: string }>("issue exists", (db) => db`SELECT month FROM issues WHERE month = ${m}`);
  if (!exists || exists.length) return null;
  return (await getIssue(m)) ? m : null;
}

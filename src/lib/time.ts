export const PUNE_TZ = "Asia/Kolkata";

/** "just now", "4m ago", "3h ago", "yesterday", "2 days ago", "3 weeks ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  const w = Math.round(d / 7);
  if (d < 30) return `${w} week${w > 1 ? "s" : ""} ago`;
  const mo = Math.round(d / 30);
  if (d < 365) return `${mo} month${mo > 1 ? "s" : ""} ago`;
  const y = Math.round(d / 365);
  return `${y} year${y > 1 ? "s" : ""} ago`;
}

/** Whether something happened within the last `hours`. */
export const within = (iso: string, hours: number, now = Date.now()) =>
  now - new Date(iso).getTime() < hours * 3600_000;

/** Current hour + minute in Pune, regardless of the visitor's timezone. */
export function puneNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PUNE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return {
    hour,
    minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/** Plain-language part of the day for an hour (0-23). */
export function dayPhase(hour: number): string {
  if (hour < 5) return "late night";
  if (hour < 8) return "early morning";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 20) return "evening";
  return "night";
}

/** Ring colour for the avatar, following the real light in Pune. */
export function phaseColor(hour: number): [string, string] {
  if (hour < 5 || hour >= 21) return ["#6b74ff", "#2a2f6b"];
  if (hour < 8) return ["#ffb37a", "#7a4bff"];
  if (hour < 17) return ["#ffd36b", "#ff8a4c"];
  return ["#ff8a4c", "#b24bff"];
}

const PUNE_MS = 5.5 * 3600_000;

/** "14:32" in Pune for an ISO time. */
export function puneClock(iso: string): string {
  return new Date(Date.parse(iso) + PUNE_MS).toISOString().slice(11, 16);
}

/** "2026-10-17": the Pune calendar day of an ISO time. */
export function puneDayKey(iso: string | number): string {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  return new Date(t + PUNE_MS).toISOString().slice(0, 10);
}

/** "Today", "Yesterday", or "Thursday 15 Oct", by Pune's calendar. */
export function puneDayLabel(iso: string, now: number): string {
  const day = puneDayKey(iso);
  if (day === puneDayKey(now)) return "Today";
  if (day === puneDayKey(now - 86400_000)) return "Yesterday";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

/** 12345 -> "12,345" (Indian grouping). */
export const fmtNum = (n: number) => new Intl.NumberFormat("en-IN").format(n);

/** 95 -> "1h 35m", 40 -> "40m". */
export function fmtMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** 0:42 style position for a song. */
export function fmtPos(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "05:08" in any IANA time zone. */
export function clockIn(tz: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  } catch {
    return puneNow(date).label;
  }
}

/** The hour (0-23) in any IANA time zone. */
export function hourIn(tz: string, date = new Date()): number {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(date));
  } catch {
    return puneNow(date).hour;
  }
}

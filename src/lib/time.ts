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

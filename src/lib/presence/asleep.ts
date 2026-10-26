import type { Bedtime, Presence } from "@/lib/presence/types";
import { clockIn } from "@/lib/time";

/**
 * Is "went to bed" still true? It is for seven hours after "Hey Siri, good
 * night", unless I've clearly got up since: a status I set afterwards, or a
 * push or a pin more than ten minutes after it. Music doesn't count; I fall
 * asleep to it. Shared by every place that says where I am, so they agree.
 */
export function inBed(
  presence: Presence | null | undefined,
  now: number,
  lastPinAt?: string | null,
  /** Music is ignored for the first two hours (I fall asleep to it), then playing something means I'm up. Anything else (laptop, push, pin, status) counts after the first hour. */
  also?: { musicAt?: string | null; deskAt?: string | null },
): Bedtime | null {
  const b = presence?.bedtime;
  if (!b || Date.parse(b.until) <= now) return null;
  const bed = Date.parse(b.at);
  const after = bed + 3600_000;
  if (presence.status && Date.parse(presence.status.setAt) > after) return null;
  if (presence.github && Date.parse(presence.github.at) > after) return null;
  if (lastPinAt && Date.parse(lastPinAt) > after) return null;
  if (also?.deskAt && Date.parse(also.deskAt) > after) return null;
  if (also?.musicAt && Date.parse(also.musicAt) > bed + 2 * 3600_000) return null;
  return b;
}

/** "01:12", in my time zone. */
export const bedClock = (b: Bedtime, tz: string) => clockIn(tz, new Date(b.at));

/** The usual bedtime: an average of clock times, counted from noon so 23:40 and 00:20 average to midnight, not noon. */
export function typicalBedtime(times: string[], tz = "Asia/Kolkata"): string | null {
  if (!times.length) return null;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const fromNoon = times.map((t) => {
    const [h, m] = fmt.format(new Date(t)).split(":").map(Number);
    return (h * 60 + m - 720 + 1440) % 1440;
  });
  const avg = Math.round(fromNoon.reduce((a, b) => a + b, 0) / fromNoon.length);
  const min = (avg + 720) % 1440;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Which night a moment belongs to: the date in Pune twelve hours earlier, so 23:30 and 01:00 are the same night. */
export function nightOf(ms: number, tz = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms - 12 * 3600_000));
}

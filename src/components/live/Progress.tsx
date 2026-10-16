"use client";

import { useSecond } from "@/lib/presence/client";
import { fmtPos } from "@/lib/time";

/**
 * Roughly where I am in the song. Nothing reports the real position, so it's
 * worked out from when the song started; "about" is said out loud.
 */
export function Progress({ startedAt, durationMs, tint }: { startedAt: string; durationMs: number; tint: string | null }) {
  const now = useSecond(true);
  if (!now) return null;
  const pos = Math.min(durationMs, Math.max(0, now - Date.parse(startedAt)));
  const pct = (pos / durationMs) * 100;
  return (
    <div className="flex items-center gap-3 text-[12px] text-quiet" aria-label={`About ${fmtPos(pos)} of ${fmtPos(durationMs)}`}>
      <span className="tnum w-9">{fmtPos(pos)}</span>
      <span className="relative h-[2px] flex-1 bg-ink/15">
        <span className="absolute inset-y-0 left-0 transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%`, backgroundColor: tint ?? "var(--ink)" }} />
      </span>
      <span className="tnum w-9 text-right">{fmtPos(durationMs)}</span>
    </div>
  );
}

"use client";

import { usePresence, useNow } from "@/lib/presence/client";
import { dayPhase, puneNow, timeAgo } from "@/lib/time";

/** One quiet line contrasting the film's 06:59 with the real time in Pune. */
export function RealNow({ className = "" }: { className?: string }) {
  const now = useNow();
  const presence = usePresence();
  if (!now) return <p className={className}>&nbsp;</p>;
  const p = puneNow(new Date(now));
  const gh = presence?.github;
  return (
    <p className={`animate-[fadein_.6s_ease] ${className}`}>
      Meanwhile, for real: it&apos;s {p.label} in Pune, {dayPhase(p.hour)}
      {gh ? `. Last pushed code ${timeAgo(gh.at, now)}.` : "."}
    </p>
  );
}

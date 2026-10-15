"use client";

import { useNow } from "@/lib/presence/client";
import { timeAgo } from "@/lib/time";

/** "2 days ago" that keeps itself current. Renders nothing on the server. */
export function Ago({ iso, className }: { iso: string; className?: string }) {
  const now = useNow();
  if (!now) return null;
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className={className}>
      {timeAgo(iso, now)}
    </time>
  );
}

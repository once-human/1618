"use client";

import { usePresence, useNow } from "@/lib/presence/client";
import { timeAgo } from "@/lib/time";

/** "updated 2 days ago" from the project's public repo. Nothing if unknown. */
export function Updated({ repo, className = "" }: { repo?: string; className?: string }) {
  const presence = usePresence();
  const now = useNow();
  const at = repo ? presence?.repos[repo.toLowerCase()] : undefined;
  if (!at || !now) return null;
  return (
    <span className={className}>
      updated <time dateTime={at}>{timeAgo(at, now)}</time>
    </span>
  );
}

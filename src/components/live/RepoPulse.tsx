"use client";

import { usePresence, useNow } from "@/lib/presence/client";
import { timeAgo, within } from "@/lib/time";

/**
 * "● updated 4m ago" for a project with a public repo. The dot glows when the
 * repo was pushed to in the last day. Renders nothing if there's no data.
 */
export function RepoPulse({ repo, className = "" }: { repo?: string; className?: string }) {
  const presence = usePresence();
  const now = useNow();
  const at = repo ? presence?.repos[repo.toLowerCase()] : undefined;
  if (!at || !now) return null;
  const hot = within(at, 24, now);

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wide ${
        hot ? "text-emerald-300/90" : "text-white/45"
      } ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {hot && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70 motion-reduce:animate-none" />
        )}
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${hot ? "bg-emerald-400" : "bg-white/35"}`}
        />
      </span>
      updated <time dateTime={at}>{timeAgo(at, now)}</time>
    </span>
  );
}

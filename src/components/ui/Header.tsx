"use client";

import { useSyncExternalStore } from "react";
import { formatClock, getClock, subscribeClock } from "@/lib/clock";
import { scrollToId } from "@/components/scroll/SmoothScroll";

/** Persistent chrome: live time-of-day indicator + "Skip to work". */
export function Header() {
  const minutes = useSyncExternalStore(subscribeClock, getClock, getClock);
  const time = formatClock(minutes);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-5 py-4 font-mono text-xs tracking-wide mix-blend-difference sm:px-8">
      <span aria-label={`Time of day: ${time}`} className="tabular-nums text-white/85">
        {time}
      </span>
      <a
        href="#counter"
        onClick={(e) => {
          e.preventDefault();
          scrollToId("counter");
        }}
        className="pointer-events-auto text-white/60 transition-colors hover:text-white"
      >
        Skip to work →
      </a>
    </header>
  );
}

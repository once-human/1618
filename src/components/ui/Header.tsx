"use client";

import { WORK_SCENE_ID } from "@/lib/scenes";

/** Persistent chrome: time-of-day indicator + the "Skip to work" control. */
export function Header({ time }: { time: string }) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-5 py-4 font-mono text-xs tracking-wide">
      <span aria-label={`Time of day: ${time}`} className="text-foreground/80">
        {time}
      </span>
      <a
        href={`#${WORK_SCENE_ID}`}
        className="pointer-events-auto text-muted transition-colors hover:text-foreground"
      >
        Skip to work →
      </a>
    </header>
  );
}

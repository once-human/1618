"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { formatClock, getClock, subscribeClock } from "@/lib/clock";
import { scrollToId } from "@/components/scroll/SmoothScroll";

const ITEMS = [
  { id: "work", label: "work" },
  { id: "listening", label: "listening" },
  { id: "saved", label: "saved" },
  { id: "say-hi", label: "say hi" },
];

const cell = "border-t border-ink pt-1.5";

/**
 * Five columns, a rule above each, like a contents line. On the home page the
 * first column is the day's clock, which moves as you scroll through it.
 * A paper strip behind it keeps it readable over any photograph.
 */
export function Nav({ home = false }: { home?: boolean }) {
  const minutes = useSyncExternalStore(subscribeClock, getClock, getClock);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 top-0 z-50 grid grid-cols-5 gap-3 bg-paper px-4 pt-3 pb-2 text-[13px] sm:gap-4 sm:text-[15px]"
    >
      {home ? (
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            scrollToId("top");
          }}
          className={`${cell} tnum pointer-events-auto`}
          aria-label={`Back to the start. Time in the day: ${formatClock(minutes)}`}
        >
          {formatClock(minutes)}
        </a>
      ) : (
        <Link href="/" className={`${cell} pointer-events-auto`}>
          the day
        </Link>
      )}
      {ITEMS.map((item) =>
        home ? (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={(e) => {
              e.preventDefault();
              scrollToId(item.id);
            }}
            className={`${cell} pointer-events-auto`}
          >
            {item.label}
          </a>
        ) : (
          <Link key={item.id} href={`/#${item.id}`} className={`${cell} pointer-events-auto`}>
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}

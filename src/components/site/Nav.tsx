"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { formatClock, getClock, subscribeClock } from "@/lib/clock";
import { scrollToId } from "@/components/scroll/scrollTo";
import { openMenu } from "@/components/site/CommandMenu";

/** Where each item shows: phones get the essentials, wide screens get everything. */
type Show = "all" | "md" | "lg";
const SHOW: Record<Show, string> = { all: "block", md: "hidden md:block", lg: "hidden lg:block" };

const SECTIONS: { id: string; label: string; show: Show }[] = [
  { id: "work", label: "work", show: "all" },
  { id: "listening", label: "listening", show: "md" },
  { id: "saved", label: "saved", show: "lg" },
];

const PAGES: { href: string; label: string; show: Show }[] = [
  { href: "/now", label: "now", show: "all" },
  { href: "/history", label: "history", show: "md" },
  { href: "/status", label: "status", show: "lg" },
  { href: "/talk", label: "talk", show: "all" },
];

const cell = "border-t border-ink pt-1.5 pointer-events-auto truncate";

/**
 * A contents line: a rule above each item. Sections of the day first, then
 * the pages, then the menu (⌘K) with everything else. On the home page the
 * first column is the day's clock, which moves as you scroll through it.
 */
export function Nav({ home = false }: { home?: boolean }) {
  const minutes = useSyncExternalStore(subscribeClock, getClock, getClock);
  const path = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 top-0 z-50 grid grid-cols-5 gap-3 bg-paper px-4 pt-3 pb-2 text-[13px] sm:gap-4 sm:text-[15px] md:grid-cols-7 lg:grid-cols-9"
    >
      {home ? (
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            scrollToId("top");
          }}
          className={`${cell} tnum`}
          aria-label={`Back to the start. Time in the day: ${formatClock(minutes)}`}
        >
          {formatClock(minutes)}
        </a>
      ) : (
        <Link href="/" className={cell}>
          the day
        </Link>
      )}
      {SECTIONS.map((s) =>
        home ? (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              scrollToId(s.id);
            }}
            className={`${cell} ${SHOW[s.show]}`}
          >
            {s.label}
          </a>
        ) : (
          <Link key={s.id} href={`/#${s.id}`} className={`${cell} ${SHOW[s.show]}`}>
            {s.label}
          </Link>
        ),
      )}
      {PAGES.map((p) => {
        const here = path === p.href || path.startsWith(`${p.href}/`);
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={here ? "page" : undefined}
            className={`${cell} ${SHOW[p.show]} ${here ? "font-semibold" : ""}`}
          >
            {p.label}
          </Link>
        );
      })}
      <button type="button" onClick={openMenu} className={`${cell} text-left`} aria-haspopup="dialog">
        menu <span className="hidden text-quiet lg:inline">⌘K</span>
      </button>
    </nav>
  );
}

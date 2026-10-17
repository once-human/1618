"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useOthers } from "@/lib/presence/here";
import { placeName } from "@/lib/geo";

/**
 * Where the other people on this page are: a dot each on a thin rail at the
 * right edge, like a second scrollbar, with mine as a ring. Hover a dot for
 * their town. Wide screens only; the status line says who's here everywhere.
 */
export function OthersRail() {
  const others = useOthers();
  const path = usePathname();
  const mine = useMyPosition();
  const here = others.filter((o) => o.path === path && o.y != null);
  if (!here.length) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed top-20 right-1.5 bottom-16 z-40 hidden w-3 md:block">
      <span className="bg-ink/15 absolute inset-y-0 left-1/2 w-px -translate-x-1/2" />
      <span
        className="border-ink absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-paper transition-[top] duration-300 motion-reduce:transition-none"
        style={{ top: `${mine * 100}%` }}
        title="you"
      />
      {here.map((o) => (
        <span
          key={o.key}
          className="group pointer-events-auto absolute left-1/2 -translate-x-1/2 -translate-y-1/2 p-1 transition-[top] duration-700 ease-out motion-reduce:transition-none"
          style={{ top: `${(o.y ?? 0) * 100}%` }}
        >
          <span className="bg-ink block size-2 rounded-full" />
          <span className="bg-ink text-paper absolute top-1/2 right-5 hidden -translate-y-1/2 px-2 py-0.5 text-[12px] whitespace-nowrap group-hover:block">
            someone in {placeName(o.city, o.country)}
          </span>
        </span>
      ))}
    </div>
  );
}

function useMyPosition() {
  const [y, setY] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        setY(max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0);
      });
    };
    on();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", on);
      removeEventListener("resize", on);
    };
  }, []);
  return y;
}

"use client";

import { useEffect, useMemo } from "react";
import { useNow, usePresence } from "@/lib/presence/client";
import { skyAt, type Sky as SkyState } from "@/lib/sky";
import { clockIn } from "@/lib/time";

/**
 * /now follows the sky where I am: the page's paper and ink shift with the
 * sun (and cloud, and rain) over my city, with stars on a clear night and
 * rain when it's raining. Put back to normal when you leave the page.
 */
export function Sky() {
  const presence = usePresence();
  const now = useNow();
  const w = presence?.weather;
  const place = presence?.place;
  const sky = useMemo<SkyState | null>(
    () => (w?.sun?.length && now ? skyAt(now, w.sun, { cloud: w.cloud, rain: w.rain }) : null),
    [now, w],
  );

  useEffect(() => {
    if (!sky) return;
    const root = document.documentElement.style;
    root.setProperty("--paper", sky.paper);
    root.setProperty("--ink", sky.ink);
    root.setProperty("--quiet", sky.quiet);
    root.colorScheme = sky.light < 0.5 ? "dark" : "light";
  }, [sky]);

  useEffect(
    () => () => {
      const root = document.documentElement.style;
      root.removeProperty("--paper");
      root.removeProperty("--ink");
      root.removeProperty("--quiet");
      root.colorScheme = "";
    },
    [],
  );

  if (!sky || !w || !place) return null;
  const today = w.sun?.find((s) => s.set > (now ?? 0)) ?? w.sun?.[0];
  const next =
    today && now
      ? now < today.rise
        ? `The sun comes up at ${clockIn(place.tz, new Date(today.rise))}.`
        : now < today.set
          ? `The sun sets at ${clockIn(place.tz, new Date(today.set))}.`
          : ""
      : "";

  return (
    <>
      <p className="text-quiet -mt-6 mb-10 max-w-[60ch]">
        This page follows the sky over {place.city} right now: {w.label.toLowerCase() || "sky"}, {w.tempC}°.{next ? ` ${next}` : ""}
      </p>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {sky.stars ? <Stars /> : null}
        {sky.rain ? <Rain /> : null}
      </div>
    </>
  );
}

/** A fixed scatter of faint stars, the same every time. */
function Stars() {
  const stars = Array.from({ length: 90 }, (_, i) => {
    const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    return { x: r(1) * 100, y: r(2) * 70, s: r(3) < 0.85 ? 1 : 2, o: 0.25 + r(4) * 0.5, d: r(5) * 6 };
  });
  return (
    <>
      {stars.map((s, i) => (
        <span
          key={i}
          className="bg-ink absolute rounded-full motion-safe:animate-pulse"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o, animationDelay: `${s.d}s`, animationDuration: "4s" }}
        />
      ))}
    </>
  );
}

/** Thin falling streaks, faint enough to read through. */
function Rain() {
  return (
    <div
      className="absolute inset-[-10%] opacity-[0.12] motion-safe:animate-[rain_0.7s_linear_infinite]"
      style={{
        backgroundImage: "repeating-linear-gradient(100deg, transparent 0 22px, var(--ink) 22px 23px)",
        backgroundSize: "120px 60px",
        maskImage: "repeating-linear-gradient(180deg, #000 0 18px, transparent 18px 46px)",
      }}
    />
  );
}

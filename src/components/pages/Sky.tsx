"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNow, usePresence } from "@/lib/presence/client";
import { skyAt, type Sky as SkyState } from "@/lib/sky";
import { clockIn } from "@/lib/time";

/**
 * /now follows the sky where I am: the page's paper and ink shift with the
 * sun (and cloud, and rain) over my city, and the top of the page shows
 * what's overhead. Put back to normal when you leave the page.
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
      {createPortal(<SkyLayer sky={sky} cloud={w.cloud ?? 0} />, document.body)}
    </>
  );
}

// Deterministic "random": the same sky layout on every visit.
const rnd = (i: number, n: number) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;

/**
 * What's overhead, drawn across the top of the page and fading out as you
 * scroll into the content: stars when it's dark (fewer behind cloud, almost
 * none in rain), clouds as thick as the actual cloud cover, rain when it's
 * raining, and a warm glow around sunrise and sunset.
 */
function SkyLayer({ sky, cloud }: { sky: SkyState; cloud: number }) {
  const dark = Math.max(0, 1 - sky.light / 0.35); // stars fade in through dusk
  const starCount = dark ? Math.round(170 * (1 - Math.min(cloud, 95) / 100) * (sky.rain ? 0.2 : 1)) : 0;
  const clouds = cloud >= 10 ? Math.min(7, 2 + Math.round(cloud / 16)) : 0;
  const night = sky.light < 0.5;
  // By day, clouds are a faint shade on white paper; at night, a light haze over the stars.
  const cloudAlpha = night ? 0.08 + (cloud / 100) * 0.08 : 0.03 + (cloud / 100) * 0.045;
  const glow = sky.phase === "dawn" || sky.phase === "dusk";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[105svh] overflow-hidden"
      style={{ maskImage: "linear-gradient(to bottom, #000 0%, #000 35%, transparent 90%)", WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 35%, transparent 90%)" }}
    >
      {glow ? (
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 70% 60% at ${sky.phase === "dawn" ? "15%" : "85%"} 0%, rgba(255, 158, 84, ${night ? 0.28 : 0.4}), transparent 70%)` }}
        />
      ) : null}

      {starCount ? (
        <div className="absolute inset-0" style={{ opacity: dark }}>
          {Array.from({ length: starCount }, (_, i) => {
            const size = rnd(i, 3) < 0.7 ? 1.5 : rnd(i, 3) < 0.92 ? 2.5 : 3.5;
            return (
              <span
                key={i}
                className="sky-anim bg-ink absolute rounded-full"
                style={{
                  left: `${rnd(i, 1) * 100}%`,
                  top: `${Math.pow(rnd(i, 2), 1.7) * 75}%`, // thicker near the top
                  width: size,
                  height: size,
                  opacity: 0.45 + rnd(i, 4) * 0.55,
                  boxShadow: size > 2 ? "0 0 6px 1px var(--ink)" : undefined,
                  animation: `twinkle ${2.5 + rnd(i, 6) * 4}s ease-in-out ${rnd(i, 5) * -6}s infinite`,
                }}
              />
            );
          })}
        </div>
      ) : null}

      {Array.from({ length: clouds }, (_, i) => {
        const wide = 30 + rnd(i, 8) * 28;
        return (
          <div
            key={i}
            className="sky-anim absolute"
            style={{
              left: `${-12 + rnd(i, 7) * 90}%`,
              top: `${2 + rnd(i, 9) * 32}%`,
              width: `${wide}vw`,
              height: `${9 + rnd(i, 10) * 9}vh`,
              animation: `drift ${80 + rnd(i, 11) * 80}s ease-in-out ${rnd(i, 12) * -80}s infinite alternate`,
            }}
          >
            {/* Three overlapping puffs make a cloud rather than a blob. */}
            {[
              [0, 30, 55, 70],
              [28, 0, 45, 100],
              [55, 25, 45, 75],
            ].map(([l, t, wd, h], j) => (
              <span
                key={j}
                className="bg-ink absolute rounded-[50%]"
                style={{ left: `${l}%`, top: `${t}%`, width: `${wd}%`, height: `${h}%`, opacity: cloudAlpha, filter: "blur(38px)" }}
              />
            ))}
          </div>
        );
      })}

      {sky.rain ? (
        <div
          className="sky-anim absolute inset-[-10%] opacity-[0.16]"
          style={{
            animation: "rain 0.6s linear infinite",
            backgroundImage: "repeating-linear-gradient(100deg, transparent 0 18px, var(--ink) 18px 19px)",
            backgroundSize: "100px 60px",
            maskImage: "repeating-linear-gradient(180deg, #000 0 18px, transparent 18px 40px)",
          }}
        />
      ) : null}
    </div>
  );
}

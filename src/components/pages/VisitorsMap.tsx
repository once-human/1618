"use client";

import { useEffect, useState } from "react";
import { LAND } from "@/content/land";
import { myTown } from "@/lib/presence/here";
import { placeName } from "@/lib/geo";
import { fmtNum } from "@/lib/time";

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const COLS = 360 / LAND.step;
const ROWS = LAND.rows.length;

interface Place {
  city: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  n: number;
}

/** The land as one path of round dots: cheap to draw, crisp at any size. */
function landPath() {
  let d = "";
  LAND.rows.forEach((row, y) => {
    const bits = [...row].map((c) => A.indexOf(c).toString(2).padStart(6, "0")).join("");
    for (let x = 0; x < COLS; x++) if (bits[x] === "1") d += `M${x + 0.5} ${y + 0.5}h0`;
  });
  return d;
}

export const LAND_PATH = landPath();

export const MAP = { cols: COLS, rows: ROWS };
export const project = (lat: number, lon: number) => ({ x: (lon + 180) / LAND.step, y: (LAND.top - lat) / LAND.step });

/**
 * Who came by today, as dots on a map: towns only, and how many from each.
 * Pune's day, so it starts fresh at midnight here.
 */
export function VisitorsMap() {
  const [data, setData] = useState<{ people: number; places: Place[] } | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/visitors/today")
        .then((r) => r.json())
        .then((d) => live && setData(d))
        .catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 120_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  if (!data) return <div className="min-h-[40vh]" aria-hidden />;
  const me = myTown();
  const towns = data.places.filter((p) => p.city || p.country);
  const placed = data.places.filter((p) => p.lat != null && p.lon != null);
  const max = Math.max(1, ...placed.map((p) => p.n));

  return (
    <section id="visitors" className="scroll-mt-24">
      <h2 className="border-ink mb-6 flex flex-wrap justify-between gap-x-4 border-t pt-1.5 font-semibold">
        Who came by today
        <span className="text-quiet font-normal">
          {!data.people
            ? "nobody yet today"
            : `${fmtNum(data.people)} ${data.people === 1 ? "person" : "people"}${towns.length ? ` from ${towns.length} ${towns.length === 1 ? "place" : "places"}` : ""} so far, Pune time`}
        </span>
      </h2>
      <svg viewBox={`0 0 ${COLS} ${ROWS}`} className="w-full" role="img" aria-label={`Map of today's visitors: ${towns.map((p) => placeName(p.city, p.country)).join(", ") || "none yet"}`}>
        <path d={LAND_PATH} className="stroke-ink/20" strokeWidth={0.55} strokeLinecap="round" fill="none" />
        {placed.map((p) => {
          const { x, y } = project(p.lat!, p.lon!);
          const r = 0.9 + 1.6 * Math.sqrt(p.n / max);
          const mine = p.city === me.city && p.country === me.country;
          return (
            <g key={`${p.city}|${p.country}`}>
              <circle cx={x} cy={y} r={r} className="fill-ink" />
              <circle cx={x} cy={y} r={r} className="stroke-ink animate-ping fill-none motion-reduce:hidden" strokeWidth={0.2} style={{ transformBox: "fill-box", transformOrigin: "center", animationDuration: "3s" }} />
              {mine ? <circle cx={x} cy={y} r={r + 1.1} className="stroke-ink fill-none" strokeWidth={0.25} /> : null}
              <title>{`${placeName(p.city, p.country)}: ${p.n}`}</title>
            </g>
          );
        })}
      </svg>
      {towns.length > 0 && (
        <p className="text-quiet mt-4 flex flex-wrap gap-x-5 gap-y-1">
          {towns.slice(0, 12).map((p) => (
            <span key={`${p.city}|${p.country}`}>
              <span className={p.city === me.city && p.country === me.country ? "text-ink" : ""}>{placeName(p.city, p.country)}</span>{" "}
              <span className="tnum">{p.n}</span>
            </span>
          ))}
          {towns.length > 12 ? <span>and {towns.length - 12} more</span> : null}
        </p>
      )}
    </section>
  );
}

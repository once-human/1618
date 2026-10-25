"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/** The land as one path of round dots: cheap to draw, crisp at any size. Units are the coarse grid's, whatever the layer's own step. */
function landPath(land: { step: number; rows: string[] }) {
  const cols = 360 / land.step;
  const k = land.step / LAND.step;
  let d = "";
  land.rows.forEach((row, y) => {
    const bits = [...row].map((c) => A.indexOf(c).toString(2).padStart(6, "0")).join("");
    for (let x = 0; x < cols; x++) if (bits[x] === "1") d += `M${((x + 0.5) * k).toFixed(3)} ${((y + 0.5) * k).toFixed(3)}h0`;
  });
  return d;
}

export const LAND_PATH = landPath(LAND);

export const MAP = { cols: COLS, rows: ROWS };
export const project = (lat: number, lon: number) => ({ x: (lon + 180) / LAND.step, y: (LAND.top - lat) / LAND.step });

/* ---- the view: a centre and a width, in map units; the height follows the box ---- */

interface View {
  cx: number;
  cy: number;
  w: number;
}
interface Box {
  w: number;
  h: number;
}
const MIN_W = 6;
const key = (p: Place) => `${p.city}|${p.country}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep the view on the map: no zooming out past the world, no panning into the void. */
function fit(v: View, box: Box): View {
  const w = clamp(v.w, MIN_W, COLS);
  const h = (w * box.h) / box.w;
  return {
    w,
    cx: w >= COLS ? COLS / 2 : clamp(v.cx, w / 2, COLS - w / 2),
    cy: h >= ROWS ? ROWS / 2 : clamp(v.cy, h / 2, ROWS - h / 2),
  };
}

/** Where most of the visitors are: a box round the towns that make up 80% of them, with room around. */
function home(places: Place[], box: Box): View {
  const placed = places.filter((p) => p.lat != null && p.lon != null).sort((a, b) => b.n - a.n);
  if (!placed.length) return { cx: COLS / 2, cy: ROWS / 2, w: COLS };
  const total = placed.reduce((a, p) => a + p.n, 0);
  const core: Place[] = [];
  let seen = 0;
  for (const p of placed) {
    core.push(p);
    seen += p.n;
    if (seen >= total * 0.8) break;
  }
  const pts = core.map((p) => project(p.lat!, p.lon!));
  const x0 = Math.min(...pts.map((p) => p.x));
  const x1 = Math.max(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y));
  const y1 = Math.max(...pts.map((p) => p.y));
  const aspect = box.w / box.h;
  const w = Math.max(22, (x1 - x0) * 1.7, (y1 - y0) * 1.7 * aspect);
  return fit({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w }, box);
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Who came by this month, as dots on a map: towns only, and how many from each.
 * Pune's calendar month, so it starts fresh on the 1st. It opens on wherever
 * most of them are; drag to move, the buttons (or ctrl + scroll, or a pinch)
 * to zoom, and hover or tap a dot for the town.
 */
export function VisitorsMap() {
  const [data, setData] = useState<{ people: number; places: Place[] } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [moved, setMoved] = useState<View | null>(null); // null: still on the opening view
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [fine, setFine] = useState<string | null>(null); // the close-up land, fetched only once you zoom in
  const wrap = useRef<HTMLDivElement>(null);
  const anim = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hintTimer = useRef(0);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/visitors/month")
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

  // The size of the map on screen, so dots and text stay the same size however far in you are.
  const ready = !!data;
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  useEffect(
    () => () => {
      cancelAnimationFrame(anim.current);
      clearTimeout(hintTimer.current);
    },
    [],
  );

  const places = useMemo(() => data?.places ?? [], [data]);
  const opening = useMemo(() => (box && data ? home(places, box) : null), [box, data, places]);
  const view = moved ?? opening;
  const close = !!view && view.w < 110;

  useEffect(() => {
    if (!close || fine) return;
    let live = true;
    void import("@/content/land-fine").then((m) => live && setFine(landPath(m.LAND_FINE)));
    return () => {
      live = false;
    };
  }, [close, fine]);

  // Ctrl or ⌘ + scroll zooms (plain scroll still scrolls the page); a plain scroll over the map says so, once.
  useEffect(() => {
    const el = wrap.current;
    if (!el || !box || !view) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setHint(true);
        clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(false), 1400);
        return;
      }
      e.preventDefault();
      cancelAnimationFrame(anim.current);
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  if (!data) return <div className="min-h-[16rem] md:min-h-[23rem] xl:min-h-[38rem]" aria-hidden />;

  const me = myTown();
  const towns = places.filter((p) => p.city || p.country);
  const placed = places.filter((p) => p.lat != null && p.lon != null);
  const max = Math.max(1, ...placed.map((p) => p.n));

  const unit = box && view ? view.w / box.w : 0; // map units per screen pixel
  const toScreen = (x: number, y: number) => (box && view ? { x: (x - (view.cx - view.w / 2)) / unit, y: (y - (view.cy - (view.w * box.h) / box.w / 2)) / unit } : { x: 0, y: 0 });

  function set(v: View) {
    if (box) setMoved(fit(v, box));
  }
  function zoomAt(factor: number, px: number, py: number) {
    if (!box || !view) return;
    const v = view;
    const w = clamp(v.w / factor, MIN_W, COLS);
    const h = (w * box.h) / box.w;
    const vh = (v.w * box.h) / box.w;
    const mx = v.cx - v.w / 2 + (px / box.w) * v.w;
    const my = v.cy - vh / 2 + (py / box.h) * vh;
    set({ w, cx: mx - (px / box.w - 0.5) * w, cy: my - (py / box.h - 0.5) * h });
  }
  function fly(to: View, then?: () => void) {
    if (!box || !view) return;
    cancelAnimationFrame(anim.current);
    const from = view;
    const target = fit(to, box);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMoved(target);
      then?.();
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 650);
      const e = ease(t);
      // Zoom in the log of the width, so it feels even.
      const w = Math.exp(Math.log(from.w) + (Math.log(target.w) - Math.log(from.w)) * e);
      setMoved(fit({ w, cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e }, box));
      if (t < 1) anim.current = requestAnimationFrame(step);
      else then?.();
    };
    anim.current = requestAnimationFrame(step);
  }
  const zoomButton = (factor: number) => box && view && fly({ ...view, w: view.w / factor });
  const toPlace = (p: Place) => {
    if (p.lat == null || p.lon == null) return;
    const { x, y } = project(p.lat, p.lon);
    setPinned(key(p));
    fly({ cx: x, cy: y, w: 12 });
  };

  function onDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType !== "touch") {
      drag.current = { x: e.clientX, y: e.clientY, moved: false };
      cancelAnimationFrame(anim.current);
    }
  }
  function onMove(e: React.PointerEvent) {
    if (!box || !view) return;
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    if (pointers.current.size === 2) {
      // Two fingers: pinch to zoom, and move together to pan.
      const [a, b] = [...pointers.current.values()];
      const other = a === prev ? b : a;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y) || 1;
      const after = Math.hypot(now.x - other.x, now.y - other.y) || 1;
      const r = wrap.current!.getBoundingClientRect();
      const mid = { x: (now.x + other.x) / 2 - r.left, y: (now.y + other.y) / 2 - r.top };
      pointers.current.set(e.pointerId, now);
      cancelAnimationFrame(anim.current);
      const dx = (now.x - prev.x) / 2;
      const dy = (now.y - prev.y) / 2;
      const w = clamp(view.w / (after / before), MIN_W, COLS);
      const k = w / box.w;
      const vh = (view.w * box.h) / box.w;
      const mx = view.cx - view.w / 2 + (mid.x / box.w) * view.w;
      const my = view.cy - vh / 2 + (mid.y / box.h) * vh;
      set({ w, cx: mx - (mid.x / box.w - 0.5) * w - dx * k, cy: my - (mid.y / box.h - 0.5) * ((w * box.h) / box.w) - dy * k });
      return;
    }
    pointers.current.set(e.pointerId, now);
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) (e.currentTarget as Element).setPointerCapture(e.pointerId); // only once it's a drag, so a click on a dot still lands
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    set({ ...view, cx: view.cx - dx * unit, cy: view.cy - dy * unit });
  }
  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (drag.current && !pointers.current.size) {
      const was = drag.current.moved;
      drag.current = null;
      if (!was && !(e.target as Element).closest("[data-dot]")) setPinned(null);
    }
  }

  const shown = hover ?? pinned;
  const focus = shown ? placed.find((p) => key(p) === shown) : null;
  const tip = focus && view ? toScreen(project(focus.lat!, focus.lon!).x, project(focus.lat!, focus.lon!).y) : null;
  const total = data.people || 1;

  // Names beside the dots that have room: the biggest first, skipping any that would sit on another's.
  const labels: Place[] = [];
  if (box && view) {
    for (const p of [...placed].sort((a, b) => b.n - a.n)) {
      const s = toScreen(project(p.lat!, p.lon!).x, project(p.lat!, p.lon!).y);
      if (s.x < 0 || s.y < 0 || s.x > box.w || s.y > box.h) continue;
      const clash = labels.some((q) => {
        const t = toScreen(project(q.lat!, q.lon!).x, project(q.lat!, q.lon!).y);
        return Math.abs(t.x - s.x) < 120 && Math.abs(t.y - s.y) < 26;
      });
      if (!clash) labels.push(p);
    }
  }
  const atHome = !!opening && !!view && Math.abs(view.w - opening.w) < 0.05 && Math.abs(view.cx - opening.cx) < 0.05 && Math.abs(view.cy - opening.cy) < 0.05;
  const btn = "border-ink bg-paper hover:bg-ink hover:text-paper grid size-9 place-items-center border text-[18px] leading-none disabled:opacity-30";

  return (
    <section id="visitors" className="scroll-mt-24">
      <h2 className="border-ink mb-6 flex flex-wrap justify-between gap-x-4 border-t pt-1.5 font-semibold">
        Who came by this month
        <span className="text-quiet font-normal">
          {!data.people
            ? "nobody yet this month"
            : `${fmtNum(data.people)} ${data.people === 1 ? "person" : "people"}${towns.length ? ` from ${towns.length} ${towns.length === 1 ? "place" : "places"}` : ""} so far`}
        </span>
      </h2>

      <div
        ref={wrap}
        className="border-ink/15 relative aspect-[4/3] w-full cursor-grab touch-pan-y overflow-hidden border select-none active:cursor-grabbing sm:aspect-[2/1] xl:aspect-[16/7]"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => {
          const r = wrap.current!.getBoundingClientRect();
          zoomAt(2, e.clientX - r.left, e.clientY - r.top);
        }}
      >
        {box && view ? (
          <>
            <svg
              viewBox={`${view.cx - view.w / 2} ${view.cy - (view.w * box.h) / box.w / 2} ${view.w} ${(view.w * box.h) / box.w}`}
              className="absolute inset-0 size-full"
              role="img"
              aria-label={`Map of this month's visitors: ${towns.map((p) => placeName(p.city, p.country)).join(", ") || "none yet"}`}
            >
              <path d={close && fine ? fine : LAND_PATH} className="stroke-ink/25" strokeWidth={close && fine ? 0.13 : 0.42} strokeLinecap="round" fill="none" />
              {placed.map((p) => {
                const { x, y } = project(p.lat!, p.lon!);
                const k = key(p);
                const on = shown === k;
                const dim = shown != null && !on;
                const r = (7 + 13 * Math.sqrt(p.n / max)) * unit;
                const mine = p.city === me.city && p.country === me.country;
                return (
                  <g key={k} data-dot style={{ opacity: dim ? 0.35 : 1, transition: "opacity .15s" }}>
                    <circle cx={x} cy={y} r={r * (on ? 1.18 : 1)} className="fill-ink" style={{ transition: "r .15s" }} />
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      className="stroke-ink animate-ping fill-none motion-reduce:hidden"
                      strokeWidth={1.5 * unit}
                      style={{ transformBox: "fill-box", transformOrigin: "center", animationDuration: "3s" }}
                    />
                    {mine ? <circle cx={x} cy={y} r={r + 4 * unit} className="stroke-ink fill-none" strokeWidth={1.5 * unit} /> : null}
                    {/* a bigger invisible target, so a dot is easy to hit */}
                    <circle
                      cx={x}
                      cy={y}
                      r={Math.max(r, 14 * unit)}
                      fill="transparent"
                      tabIndex={0}
                      role="button"
                      aria-label={`${placeName(p.city, p.country)}: ${p.n}`}
                      className="cursor-pointer outline-none"
                      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(k)}
                      onPointerLeave={() => setHover(null)}
                      onFocus={() => setHover(k)}
                      onBlur={() => setHover(null)}
                      onClick={() => setPinned((c) => (c === k ? null : k))}
                      onDoubleClick={(e) => (e.stopPropagation(), toPlace(p))}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toPlace(p))}
                    />
                  </g>
                );
              })}
            </svg>

            {/* names beside the dots that have room */}
            {labels.map((p) => {
              const s = toScreen(project(p.lat!, p.lon!).x, project(p.lat!, p.lon!).y);
              const r = 7 + 13 * Math.sqrt(p.n / max);
              return key(p) === shown ? null : (
                <span
                  key={key(p)}
                  className="pointer-events-none absolute text-[12px] leading-none whitespace-nowrap"
                  style={{ left: s.x + r + 5, top: s.y, transform: "translateY(-50%)" }}
                >
                  {p.city ?? placeName(null, p.country)} <span className="text-quiet tnum">{p.n}</span>
                </span>
              );
            })}

            {/* the one under the pointer */}
            {focus && tip ? (
              <div
                role="status"
                className="border-ink bg-paper pointer-events-none absolute z-10 w-max max-w-[16rem] border px-3 py-2 text-[13px] leading-snug shadow-[3px_3px_0_0_var(--color-ink)]"
                style={{ left: clamp(tip.x, 90, (box?.w ?? 0) - 90), top: Math.max(tip.y - (10 + 13 * Math.sqrt(focus.n / max)) - 10, 56), transform: "translate(-50%, -100%)" }}
              >
                <p className="font-semibold">{placeName(focus.city, focus.country)}</p>
                <p className="text-quiet">
                  {fmtNum(focus.n)} {focus.n === 1 ? "person" : "people"} · {Math.round((focus.n / total) * 100)}% of this month
                  {focus.city === me.city && focus.country === me.country ? " · that's you" : ""}
                </p>
              </div>
            ) : null}

            {/* zoom */}
            <div className="absolute top-2 right-2 z-10 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" className={btn} aria-label="Zoom in" onClick={() => zoomButton(2)} disabled={view.w <= MIN_W + 0.01}>
                +
              </button>
              <button type="button" className={btn} aria-label="Zoom out" onClick={() => zoomButton(0.5)} disabled={view.w >= COLS - 0.01}>
                −
              </button>
            </div>
            <div className="absolute bottom-2 left-2 z-10 flex gap-1 text-[13px]" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" className="border-ink bg-paper hover:bg-ink hover:text-paper border px-2.5 py-1 disabled:opacity-30" disabled={atHome} onClick={() => opening && fly(opening, () => setMoved(null))}>
                Back to the busiest part
              </button>
              <button type="button" className="border-ink bg-paper hover:bg-ink hover:text-paper border px-2.5 py-1 disabled:opacity-30" disabled={view.w >= COLS - 0.01} onClick={() => fly({ cx: COLS / 2, cy: ROWS / 2, w: COLS })}>
                The world
              </button>
            </div>
            <p
              aria-hidden
              className={`bg-paper/90 pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 px-3 py-1 text-[13px] transition-opacity ${hint ? "opacity-100" : "opacity-0"}`}
            >
              Hold Ctrl (⌘ on a Mac) and scroll to zoom
            </p>
          </>
        ) : null}
      </div>
      <p className="text-quiet mt-2 text-[13px]">Drag to move, double-click to zoom in, hover a dot for the town. On a phone: pinch with two fingers.</p>

      {towns.length > 0 && (
        <p className="text-quiet mt-4 flex flex-wrap gap-x-5 gap-y-1">
          {towns.slice(0, 12).map((p) => {
            const k = key(p);
            return (
              <button
                key={k}
                type="button"
                className={`hover:text-ink text-left ${shown === k ? "text-ink" : ""}`}
                onPointerEnter={(e) => e.pointerType === "mouse" && setHover(k)}
                onPointerLeave={() => setHover(null)}
                onClick={() => toPlace(p)}
              >
                <span className={p.city === me.city && p.country === me.country ? "text-ink" : ""}>{placeName(p.city, p.country)}</span>{" "}
                <span className="tnum">{p.n}</span>
              </button>
            );
          })}
          {towns.length > 12 ? <span>and {towns.length - 12} more</span> : null}
        </p>
      )}
    </section>
  );
}

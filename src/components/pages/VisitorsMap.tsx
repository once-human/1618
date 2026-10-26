"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LAND } from "@/content/land";
import { myTown } from "@/lib/presence/here";
import { placeName } from "@/lib/geo";
import { fmtNum } from "@/lib/time";
import { COARSE, decode, type Layer } from "./landgrid";
import { VisitorsGlobe } from "./VisitorsGlobe";
import { swarm } from "./swarm";

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
interface Data {
  people: number;
  places: Place[];
  days?: { day: string; n: number }[];
  live?: { city: string | null; country: string | null; n: number }[];
}

/** The land as one path of round dots (the admin's small static map uses this). */
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
const unproject = (x: number, y: number) => ({ lon: x * LAND.step - 180, lat: LAND.top - y * LAND.step });



/* ---- the view: a centre and a width in map units; the height follows the box ---- */

interface View {
  cx: number;
  cy: number;
  w: number;
}
interface Box {
  w: number;
  h: number;
}
const MIN_W = 3;
const key = (p: Place) => `${p.city}|${p.country}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const hOf = (v: View, box: Box) => (v.w * box.h) / box.w;

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
  const w = Math.max(22, (x1 - x0) * 1.7, (y1 - y0) * 1.7 * (box.w / box.h));
  return fit({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w }, box);
}

/* ---- small geography ---- */

const KM_PER_DEG = 111.32;
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const dms = (lat: number, lon: number) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? "W" : "E"}`;
/** A round length for the scale bar: 1, 2 or 5 × 10ⁿ km. */
function nice(kmMax: number) {
  const p = 10 ** Math.floor(Math.log10(kmMax));
  const m = kmMax / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

/**
 * Who came by this month: towns only, and how many from each, on a map that
 * opens where most of them are. The land is drawn on a canvas, only what's
 * on screen, so moving and zooming stay smooth.
 *
 * Drag to move; zoom with the buttons, double-click, Ctrl/⌘ + scroll or a
 * pinch; hover or tap a dot for the town. The list beside it is the same
 * towns, ranked.
 */
export function VisitorsMap() {
  const [data, setData] = useState<Data | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [moved, setMoved] = useState<View | null>(null); // null: still on the opening view
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [mode, setMode] = useState<"globe" | "flat">("globe");
  const [goto, setGoto] = useState<{ k: string; n: number } | null>(null);
  const [fine, setFine] = useState<Layer | null>(null); // the close-up coastline, fetched only once you zoom in
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const anim = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hintTimer = useRef(0);
  const viewRef = useRef<View | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/visitors/month")
        .then((r) => r.json())
        .then((d) => live && setData(d))
        .catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const ready = !!data;
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, mode]);

  useEffect(
    () => () => {
      cancelAnimationFrame(anim.current);
      clearTimeout(hintTimer.current);
    },
    [],
  );

  const places = useMemo(() => data?.places ?? [], [data]);
  // Only towns with someone on the site right now pulse.
  const liveN = useMemo(() => new Map((data?.live ?? []).map((l) => [`${l.city}|${l.country}`, l.n])), [data]);
  const opening = useMemo(() => (box && data ? home(places, box) : null), [box, data, places]);
  const view = moved ?? opening;
  const busiest = useMemo(() => (opening && box ? fit({ ...opening, w: opening.w / 1.5 }, box) : null), [opening, box]); // the button: 1.5× closer on the same part
  useEffect(() => {
    viewRef.current = view;
  });
  const close = !!view && view.w < 110;

  useEffect(() => {
    if (!close || fine) return;
    let live = true;
    void import("@/content/land-fine").then((m) => live && setFine(decode(m.LAND_FINE)));
    return () => {
      live = false;
    };
  }, [close, fine]);

  // Draw the land: only the dots that are on screen.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !box || !view) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(box.w * dpr) || cv.height !== Math.round(box.h * dpr)) {
      cv.width = Math.round(box.w * dpr);
      cv.height = Math.round(box.h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const L = close && fine ? fine : COARSE;
    const s = (box.w / view.w) * dpr; // device pixels per map unit
    const left = view.cx - view.w / 2;
    const top = view.cy - hOf(view, box) / 2;
    const r = Math.max(0.6 * dpr, 0.23 * L.c * s);
    const x0 = Math.max(0, Math.floor(left / L.c) - 1);
    const x1 = Math.min(L.cols - 1, Math.ceil((left + view.w) / L.c) + 1);
    const y0 = Math.max(0, Math.floor(top / L.c) - 1);
    const y1 = Math.min(L.rows - 1, Math.ceil((top + hOf(view, box)) / L.c) + 1);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = getComputedStyle(cv).color;
    ctx.globalAlpha = 0.26;
    ctx.beginPath();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!L.bits[y * L.cols + x]) continue;
        const px = ((x + 0.5) * L.c - left) * s;
        const py = ((y + 0.5) * L.c - top) * s;
        ctx.moveTo(px + r, py);
        ctx.arc(px, py, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }, [view, box, fine, close, data]);

  const set = useCallback(
    (v: View) => {
      if (box) setMoved(fit(v, box));
    },
    [box],
  );
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const v = viewRef.current;
      if (!box || !v) return;
      const w = clamp(v.w / factor, MIN_W, COLS);
      const h = (w * box.h) / box.w;
      const mx = v.cx - v.w / 2 + (px / box.w) * v.w;
      const my = v.cy - hOf(v, box) / 2 + (py / box.h) * hOf(v, box);
      set({ w, cx: mx - (px / box.w - 0.5) * w, cy: my - (py / box.h - 0.5) * h });
    },
    [box, set],
  );

  // Ctrl or ⌘ + scroll zooms (a plain scroll still scrolls the page); a plain scroll over the map says so, briefly.
  useEffect(() => {
    const el = wrap.current;
    if (!el || !box) return;
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
  }, [box, zoomAt, ready, mode]);

  if (!data) return <div className="min-h-[16rem] md:min-h-[23rem] xl:min-h-[38rem]" aria-hidden />;

  const me = myTown();
  const towns = places.filter((p) => p.city || p.country);
  const placed = places.filter((p) => p.lat != null && p.lon != null);
  const max = Math.max(1, ...placed.map((p) => p.n));
  const total = data.people || 1;
  const countries = new Set(places.map((p) => p.country).filter(Boolean)).size;
  const top = places[0];
  const mine = places.find((p) => p.city === me.city && p.country === me.country && p.lat != null);
  const dayList = data.days ?? [];
  const hereNow = [...liveN.values()].reduce((a, b) => a + b, 0);

  const unit = box && view ? view.w / box.w : 0; // map units per screen pixel
  const origin = box && view ? { x: view.cx - view.w / 2, y: view.cy - hOf(view, box) / 2 } : { x: 0, y: 0 };
  const toScreen = (p: Place) => {
    const { x, y } = project(p.lat!, p.lon!);
    return { x: (x - origin.x) / unit, y: (y - origin.y) / unit };
  };

  function fly(to: View, then?: () => void) {
    const from = viewRef.current;
    if (!box || !from) return;
    cancelAnimationFrame(anim.current);
    const target = fit(to, box);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMoved(target);
      then?.();
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 600);
      const e = ease(t);
      // zoom in the log of the width, so it feels even
      const w = Math.exp(Math.log(from.w) + (Math.log(target.w) - Math.log(from.w)) * e);
      setMoved(fit({ w, cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e }, box));
      if (t < 1) anim.current = requestAnimationFrame(step);
      else then?.();
    };
    anim.current = requestAnimationFrame(step);
  }
  const zoomButton = (factor: number) => view && fly({ ...view, w: view.w / factor });
  const toPlace = (p: Place) => {
    if (p.lat == null || p.lon == null) return;
    const { x, y } = project(p.lat, p.lon);
    setPinned(key(p));
    if (mode === "globe") return setGoto({ k: key(p), n: Date.now() });
    fly({ cx: x, cy: y, w: 10 });
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
    // The coordinates under the pointer, written straight into the page (no re-render).
    const r = wrap.current!.getBoundingClientRect();
    if (readout.current) {
      const g = unproject(origin.x + (e.clientX - r.left) * unit, origin.y + (e.clientY - r.top) * unit);
      readout.current.textContent = Math.abs(g.lat) <= 90 ? dms(g.lat, g.lon) : "";
    }
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    if (pointers.current.size === 2) {
      // Two fingers: pinch to zoom, and move together to pan.
      const [a, b] = [...pointers.current.values()];
      const other = a === prev ? b : a;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y) || 1;
      const after = Math.hypot(now.x - other.x, now.y - other.y) || 1;
      const mid = { x: (now.x + other.x) / 2 - r.left, y: (now.y + other.y) / 2 - r.top };
      pointers.current.set(e.pointerId, now);
      cancelAnimationFrame(anim.current);
      const w = clamp(view.w / (after / before), MIN_W, COLS);
      const k = w / box.w;
      const mx = origin.x + mid.x * unit;
      const my = origin.y + mid.y * unit;
      set({ w, cx: mx - (mid.x / box.w - 0.5) * w - ((now.x - prev.x) / 2) * k, cy: my - (mid.y / box.h - 0.5) * ((w * box.h) / box.w) - ((now.y - prev.y) / 2) * k });
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
  const tip = focus && box && view ? toScreen(focus) : null;
  const radius = (p: Place) => swarm(p.n).reach; // px, the same at any zoom

  // Names beside the dots that have room: the biggest first, skipping any that would sit on another's.
  const labels: Place[] = [];
  if (box && view) {
    const spots: { x: number; y: number }[] = [];
    for (const p of [...placed].sort((a, b) => b.n - a.n)) {
      const s = toScreen(p);
      if (s.x < 0 || s.y < 0 || s.x > box.w || s.y > box.h) continue;
      if (!spots.some((t) => Math.abs(t.x - s.x) < 120 && Math.abs(t.y - s.y) < 26)) {
        labels.push(p);
        spots.push(s);
      }
    }
  }
  const atHome = !!busiest && !!view && Math.abs(view.w - busiest.w) < 0.05 && Math.abs(view.cx - busiest.cx) < 0.05 && Math.abs(view.cy - busiest.cy) < 0.05;
  const btn = "border-ink bg-paper hover:bg-ink hover:text-paper grid size-9 place-items-center border text-[18px] leading-none disabled:opacity-30";
  const pill = "border-ink bg-paper hover:bg-ink hover:text-paper border px-2.5 py-1 disabled:opacity-30";

  // Scale bar: how far a round number of kilometres is, at the middle of the view, now.
  let scale: { km: number; px: number } | null = null;
  if (box && view) {
    const latMid = unproject(view.cx, view.cy).lat;
    const kmPerPx = (LAND.step * KM_PER_DEG * Math.cos((clamp(latMid, -80, 80) * Math.PI) / 180)) / (box.w / view.w);
    const k = nice(kmPerPx * 110);
    scale = { km: k, px: k / kmPerPx };
  }
  const zoom = view ? COLS / view.w : 1;

  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const maxDay = Math.max(1, ...dayList.map((d) => d.n));
  const dim = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const byDay = new Map(dayList.map((d) => [Number(d.day.slice(8, 10)), d.n]));
  const dayNow = Number(today.slice(8, 10));

  const townsBlock = (
    <div className="min-w-0">
      <h3 className="border-ink/20 mb-2 flex justify-between border-t pt-1.5 text-[14px] font-semibold">
            Towns <span className="text-quiet font-normal">people · share</span>
          </h3>
          {towns.length ? (
            <ol className="text-[14px]">
              {towns.slice(0, 10).map((p) => {
                const k = key(p);
                const share = p.n / total;
                return (
                  <li key={k}>
                    <button
                      type="button"
                      className={`hover:bg-ink/[0.05] relative block w-full py-1.5 text-left ${shown === k ? "bg-ink/[0.05]" : ""}`}
                      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(k)}
                      onPointerLeave={() => setHover(null)}
                      onClick={() => toPlace(p)}
                    >
                      <span className="flex justify-between gap-3">
                        <span className="truncate">
                          {liveN.has(k) ? <span className="bg-ink mr-1.5 inline-block size-1.5 animate-pulse rounded-full align-middle" title="Someone here now" /> : null}
                          {placeName(p.city, p.country)}
                        </span>
                        <span className="tnum shrink-0">
                          {fmtNum(p.n)} <span className="text-quiet">· {Math.round(share * 100)}%</span>
                        </span>
                      </span>
                      <span className="bg-ink/10 mt-1 block h-[3px]">
                        <span className="bg-ink block h-full" style={{ width: `${(p.n / max) * 100}%` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
              {towns.length > 10 ? <li className="text-quiet py-1.5">and {towns.length - 10} more</li> : null}
            </ol>
          ) : (
            <p className="text-quiet py-2 text-[14px]">Nobody yet.</p>
          )}

          
    </div>
  );
  const daysBlock = (
    <div className="min-w-0 lg:max-w-[18rem]">
      <h3 className="border-ink/20 mt-8 mb-2 flex justify-between border-t pt-1.5 text-[14px] font-semibold">
            By day <span className="text-quiet font-normal">people</span>
          </h3>
          <div className="flex h-14 items-end gap-px" role="img" aria-label="People per day this month">
            {Array.from({ length: dim }, (_, i) => {
              const n = byDay.get(i + 1) ?? 0;
              const future = i + 1 > dayNow;
              return (
                <span
                  key={i}
                  title={`${i + 1}: ${n}`}
                  className={`flex-1 ${i + 1 === dayNow ? "bg-ink" : "bg-ink/40"} ${future ? "opacity-20" : ""}`}
                  style={{ height: future || !n ? 2 : `${Math.max(8, (n / maxDay) * 100)}%` }}
                />
              );
            })}
          </div>
          <p className="text-quiet tnum mt-1 flex justify-between text-[12px]">
            <span>1</span>
            <span>{dim}</span>
          </p>

    </div>
  );
  if (mode === "globe") {
    return (
      <section id="visitors" className="scroll-mt-24">
        <div className="relative isolate">
          <div className="absolute inset-y-0 left-1/2 z-0 w-screen -translate-x-1/2">
            <VisitorsGlobe places={placed} live={liveN} shown={shown} onHover={setHover} onPin={setPinned} goto={goto} total={total} me={me} mine={mine} />
          </div>
          <div className="pointer-events-none relative z-10 flex min-h-[46rem] flex-col lg:min-h-[54rem]">
            <div className="relative pb-10">
              <div aria-hidden className="bg-paper/55 absolute inset-x-0 -top-2 bottom-0 -z-10 backdrop-blur-[3px] [mask-image:linear-gradient(to_bottom,#000_62%,transparent)]" />
              <h2 className="border-ink mb-6 flex flex-wrap justify-between gap-x-4 border-t pt-1.5 font-semibold">
        Who came by this month
        <span className="text-quiet font-normal">
          {!data.people ? "nobody yet this month" : `${fmtNum(data.people)} ${data.people === 1 ? "person" : "people"} so far, since the 1st`}
          {hereNow ? ` · ${fmtNum(hereNow)} here now` : ""}
        </span>
      </h2>
              <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {[
          { k: "People", v: fmtNum(data.people), s: "each counted once a day" },
          { k: "Places", v: fmtNum(towns.length), s: `${countries} ${countries === 1 ? "country" : "countries"}` },
          { k: "Busiest", v: top?.city ?? "–", s: top ? `${Math.round((top.n / total) * 100)}% · ${fmtNum(top.n)} people` : "" },
          { k: "Active days", v: `${byDay.size}`, s: `of ${dayNow} so far` },
        ].map((x) => (
          <div key={x.k} className="border-ink/20 border-t pt-1.5">
            <dt className="text-quiet text-[13px]">{x.k}</dt>
            <dd className="tnum truncate text-[clamp(1.4rem,2.6vw,2rem)] leading-tight font-semibold">{x.v}</dd>
            <dd className="text-quiet truncate text-[13px]">{x.s}</dd>
          </div>
        ))}
      </dl>
            </div>
            <div className="pointer-events-auto w-fit">
              <div className="mb-3 flex gap-5 text-[14px]" role="radiogroup" aria-label="How to show it">
            {(["globe", "flat"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`border-b-2 pb-0.5 ${mode === m ? "border-ink font-semibold" : "text-quiet hover:text-ink border-transparent"}`}
              >
                {m === "globe" ? "Globe" : "Flat map"}
              </button>
            ))}
          </div>

            </div>
            <div className="min-h-[24rem] flex-1" />
          </div>
          <div className="pointer-events-auto absolute top-[13.5rem] right-0 z-10 hidden w-[19rem] lg:block">
            <div className="bg-paper/55 -ml-8 pt-1 pr-0 pb-3 pl-8 backdrop-blur-md [mask-image:linear-gradient(to_right,transparent,#000_2rem)]">{townsBlock}</div>
          </div>
        </div>
        <div className="mt-6 lg:hidden">{townsBlock}</div>
        <div className="mt-2">{daysBlock}</div>
      </section>
    );
  }

  return (
    <section id="visitors" className="scroll-mt-24">
      <h2 className="border-ink mb-6 flex flex-wrap justify-between gap-x-4 border-t pt-1.5 font-semibold">
        Who came by this month
        <span className="text-quiet font-normal">
          {!data.people ? "nobody yet this month" : `${fmtNum(data.people)} ${data.people === 1 ? "person" : "people"} so far, since the 1st`}
          {hereNow ? ` · ${fmtNum(hereNow)} here now` : ""}
        </span>
      </h2>

      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {[
          { k: "People", v: fmtNum(data.people), s: "each counted once a day" },
          { k: "Places", v: fmtNum(towns.length), s: `${countries} ${countries === 1 ? "country" : "countries"}` },
          { k: "Busiest", v: top?.city ?? "–", s: top ? `${Math.round((top.n / total) * 100)}% · ${fmtNum(top.n)} people` : "" },
          { k: "Active days", v: `${byDay.size}`, s: `of ${dayNow} so far` },
        ].map((x) => (
          <div key={x.k} className="border-ink/20 border-t pt-1.5">
            <dt className="text-quiet text-[13px]">{x.k}</dt>
            <dd className="tnum truncate text-[clamp(1.4rem,2.6vw,2rem)] leading-tight font-semibold">{x.v}</dd>
            <dd className="text-quiet truncate text-[13px]">{x.s}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div className="mb-3 flex gap-5 text-[14px]" role="radiogroup" aria-label="How to show it">
            {(["globe", "flat"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`border-b-2 pb-0.5 ${mode === m ? "border-ink font-semibold" : "text-quiet hover:text-ink border-transparent"}`}
              >
                {m === "globe" ? "Globe" : "Flat map"}
              </button>
            ))}
          </div>
                    <div
            ref={wrap}
            className="border-ink/15 relative aspect-[4/3] w-full cursor-grab touch-pan-y overflow-hidden border select-none active:cursor-grabbing sm:aspect-[16/10]"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => readout.current && (readout.current.textContent = "")}
            onDoubleClick={(e) => {
              const r = wrap.current!.getBoundingClientRect();
              zoomAt(2, e.clientX - r.left, e.clientY - r.top);
            }}
          >
            <canvas ref={canvas} className="text-ink absolute inset-0 size-full" aria-hidden />
            {box && view ? (
              <>
                <svg
                  viewBox={`${origin.x} ${origin.y} ${view.w} ${hOf(view, box)}`}
                  className="absolute inset-0 size-full"
                  role="img"
                  aria-label={`Map of this month's visitors: ${towns.map((p) => placeName(p.city, p.country)).join(", ") || "none yet"}`}
                >
                  {placed.map((p) => {
                    const { x, y } = project(p.lat!, p.lon!);
                    const k = key(p);
                    const on = shown === k;
                    const r = radius(p) * unit;
                    return (
                      <g key={k} data-dot style={{ opacity: shown != null && !on ? 0.35 : 1, transition: "opacity .15s" }}>
                        {swarm(p.n).pts.map((d, i) => {
                          const cx = x + d.x * unit * (on ? 1.15 : 1);
                          const cy = y + d.y * unit * (on ? 1.15 : 1);
                          const dr = swarm(p.n).dot * unit * (on ? 1.2 : 1);
                          return (
                            <g key={i}>
                              {i < (liveN.get(k) ?? 0) ? (
                                <circle cx={cx} cy={cy} r={dr} className="stroke-ink animate-ping fill-none motion-reduce:hidden" strokeWidth={1.5 * unit} style={{ transformBox: "fill-box", transformOrigin: "center", animationDuration: "2s" }} />
                              ) : null}
                              <circle cx={cx} cy={cy} r={dr} className="fill-ink stroke-paper" strokeWidth={1.2 * unit} />
                            </g>
                          );
                        })}
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

                {labels.map((p) => {
                  const s = toScreen(p);
                  return key(p) === shown ? null : (
                    <span key={key(p)} className="pointer-events-none absolute text-[12px] leading-none whitespace-nowrap" style={{ left: s.x + radius(p) + 5, top: s.y, transform: "translateY(-50%)" }}>
                      {p.city ?? placeName(null, p.country)} <span className="text-quiet tnum">{p.n}</span>
                    </span>
                  );
                })}

                {focus && tip ? (
                  <div
                    role="status"
                    className="border-ink bg-paper pointer-events-none absolute z-10 w-max max-w-[17rem] border px-3 py-2 text-[13px] leading-snug shadow-[3px_3px_0_0_var(--color-ink)]"
                    style={{ left: clamp(tip.x, 100, box.w - 100), top: Math.max(tip.y - radius(focus) - 10, 70), transform: "translate(-50%, -100%)" }}
                  >
                    <p className="font-semibold">{placeName(focus.city, focus.country)}</p>
                    <p className="text-quiet tnum">
                      {fmtNum(focus.n)} {focus.n === 1 ? "person" : "people"} · {Math.round((focus.n / total) * 100)}% of the month
                      {liveN.has(key(focus)) ? ` · ${liveN.get(key(focus))} here now` : ""}
                    </p>
                    <p className="text-quiet tnum">
                      {dms(focus.lat!, focus.lon!)}
                      {mine && focus !== mine ? ` · ${fmtNum(Math.round(km({ lat: mine.lat!, lon: mine.lon! }, { lat: focus.lat!, lon: focus.lon! })))} km from you` : focus === mine ? " · that's you" : ""}
                    </p>
                  </div>
                ) : null}

                <div className="absolute top-2 right-2 z-10 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
                  <button type="button" className={btn} aria-label="Zoom in" onClick={() => zoomButton(2)} disabled={view.w <= MIN_W + 0.01}>
                    +
                  </button>
                  <button type="button" className={btn} aria-label="Zoom out" onClick={() => zoomButton(0.5)} disabled={view.w >= COLS - 0.01}>
                    −
                  </button>
                </div>
                <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-1 text-[13px]" onPointerDown={(e) => e.stopPropagation()}>
                  <button type="button" className={pill} disabled={atHome} onClick={() => busiest && fly(busiest)}>
                    Busiest part
                  </button>
                  <button type="button" className={pill} disabled={view.w >= COLS - 0.01} onClick={() => fly({ cx: COLS / 2, cy: ROWS / 2, w: COLS })}>
                    World
                  </button>
                </div>
                {scale ? (
                  <div className="pointer-events-none absolute right-2 bottom-2 z-10 text-right text-[12px] leading-none">
                    <p className="tnum text-quiet mb-1">×{zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}</p>
                    <div className="border-ink ml-auto h-1.5 border-x border-b" style={{ width: scale.px }} />
                    <p className="tnum mt-1">{fmtNum(scale.km)} km</p>
                  </div>
                ) : null}
                <p
                  aria-hidden
                  className={`bg-paper/90 pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 px-3 py-1 text-[13px] transition-opacity ${hint ? "opacity-100" : "opacity-0"}`}
                >
                  Hold Ctrl (⌘ on a Mac) and scroll to zoom
                </p>
              </>
            ) : null}
          </div>
          <p className="text-quiet mt-2 flex flex-wrap justify-between gap-x-4 text-[13px]">
            <span>Drag to move · double-click or +/− to zoom · pinch on a phone</span>
            <span ref={readout} className="tnum" aria-hidden />
          </p>
        </div>

        <div className="min-w-0">
          <h3 className="border-ink/20 mb-2 flex justify-between border-t pt-1.5 text-[14px] font-semibold">
            Towns <span className="text-quiet font-normal">people · share</span>
          </h3>
          {towns.length ? (
            <ol className="text-[14px]">
              {towns.slice(0, 10).map((p) => {
                const k = key(p);
                const share = p.n / total;
                return (
                  <li key={k}>
                    <button
                      type="button"
                      className={`hover:bg-ink/[0.05] relative block w-full py-1.5 text-left ${shown === k ? "bg-ink/[0.05]" : ""}`}
                      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(k)}
                      onPointerLeave={() => setHover(null)}
                      onClick={() => toPlace(p)}
                    >
                      <span className="flex justify-between gap-3">
                        <span className="truncate">
                          {liveN.has(k) ? <span className="bg-ink mr-1.5 inline-block size-1.5 animate-pulse rounded-full align-middle" title="Someone here now" /> : null}
                          {placeName(p.city, p.country)}
                        </span>
                        <span className="tnum shrink-0">
                          {fmtNum(p.n)} <span className="text-quiet">· {Math.round(share * 100)}%</span>
                        </span>
                      </span>
                      <span className="bg-ink/10 mt-1 block h-[3px]">
                        <span className="bg-ink block h-full" style={{ width: `${(p.n / max) * 100}%` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
              {towns.length > 10 ? <li className="text-quiet py-1.5">and {towns.length - 10} more</li> : null}
            </ol>
          ) : (
            <p className="text-quiet py-2 text-[14px]">Nobody yet.</p>
          )}

          <h3 className="border-ink/20 mt-6 mb-2 flex justify-between border-t pt-1.5 text-[14px] font-semibold">
            By day <span className="text-quiet font-normal">people</span>
          </h3>
          <div className="flex h-14 items-end gap-px" role="img" aria-label="People per day this month">
            {Array.from({ length: dim }, (_, i) => {
              const n = byDay.get(i + 1) ?? 0;
              const future = i + 1 > dayNow;
              return (
                <span
                  key={i}
                  title={`${i + 1}: ${n}`}
                  className={`flex-1 ${i + 1 === dayNow ? "bg-ink" : "bg-ink/40"} ${future ? "opacity-20" : ""}`}
                  style={{ height: future || !n ? 2 : `${Math.max(8, (n / maxDay) * 100)}%` }}
                />
              );
            })}
          </div>
          <p className="text-quiet tnum mt-1 flex justify-between text-[12px]">
            <span>1</span>
            <span>{dim}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

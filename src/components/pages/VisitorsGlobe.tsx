"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LAND } from "@/content/land";
import { placeName } from "@/lib/geo";
import { fmtNum } from "@/lib/time";
import { COARSE, decode, type Layer } from "./landgrid";

export interface GPlace {
  city: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  n: number;
}

const D2R = Math.PI / 180;
const MAX_LAT = 1.35; // radians: stop short of the poles so it never flips
const MIN_S = 0.7;
const MAX_S = 5;
const key = (p: GPlace) => `${p.city}|${p.country}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const wrap = (a: number) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/** Unit vectors (x, y, z) of every land cell of a layer, made once. */
function vectors(L: Layer): { v: Float32Array; deg: number } {
  const deg = L.c * LAND.step;
  const out: number[] = [];
  for (let y = 0; y < L.rows; y++) {
    const lat = (LAND.top - (y + 0.5) * deg) * D2R;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let x = 0; x < L.cols; x++) {
      if (!L.bits[y * L.cols + x]) continue;
      const lon = ((x + 0.5) * deg - 180) * D2R;
      out.push(cl * Math.sin(lon), sl, cl * Math.cos(lon));
    }
  }
  return { v: Float32Array.from(out), deg };
}
const COARSE_V = vectors(COARSE);

const dms = (lat: number, lon: number) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? "W" : "E"}`;
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const h = Math.sin(((b.lat - a.lat) * D2R) / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(((b.lon - a.lon) * D2R) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Where to face first: the average direction of the towns that make up 80% of the visitors. */
function opening(places: GPlace[]): { lon: number; lat: number } {
  const placed = places.filter((p) => p.lat != null && p.lon != null).sort((a, b) => b.n - a.n);
  if (!placed.length) return { lon: 78 * D2R, lat: 20 * D2R };
  const total = placed.reduce((a, p) => a + p.n, 0);
  let x = 0;
  let y = 0;
  let z = 0;
  let seen = 0;
  for (const p of placed) {
    const la = p.lat! * D2R;
    const lo = p.lon! * D2R;
    x += p.n * Math.cos(la) * Math.sin(lo);
    y += p.n * Math.sin(la);
    z += p.n * Math.cos(la) * Math.cos(lo);
    seen += p.n;
    if (seen >= total * 0.8) break;
  }
  return { lon: Math.atan2(x, z), lat: Math.atan2(y, Math.hypot(x, z)) };
}

interface Props {
  places: GPlace[];
  live: Map<string, number>;
  shown: string | null;
  onHover: (k: string | null) => void;
  onPin: (k: string | null) => void;
  goto: { k: string; n: number } | null;
  total: number;
  me: { city: string | null; country: string | null };
  mine: GPlace | undefined;
}

/**
 * The visitors on a globe you can turn. Drawn on a canvas, land as dots, only
 * the side that faces you; a town with someone on the site right now pulses.
 * It only redraws while something moves, and not at all while off screen.
 */
export function VisitorsGlobe({ places, live, shown, onHover, onPin, goto, total, me, mine }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [fine, setFine] = useState<{ v: Float32Array; deg: number } | null>(null);
  const [spin, setSpin] = useState(false);
  const [hint, setHint] = useState(false);
  const [atHome, setAtHome] = useState(true);

  const placed = useMemo(() => places.filter((p) => p.lat != null && p.lon != null), [places]);
  const max = Math.max(1, ...placed.map((p) => p.n));
  const open = useMemo(() => opening(places), [places]);

  // Everything that changes every frame lives here, not in React state.
  const st = useRef({
    lon: open.lon,
    lat: open.lat,
    s: 1,
    vLon: 0,
    vLat: 0,
    dragging: false,
    last: 0,
    anim: null as null | { t0: number; from: { lon: number; lat: number; s: number }; to: { lon: number; lat: number; s: number } },
    hit: [] as { k: string; x: number; y: number; r: number }[],
    visible: true,
    raf: 0,
    wake: () => {},
    hintTimer: 0,
    pointers: new Map<number, { x: number; y: number }>(),
    started: false,
  });
  const props = useRef({ placed, live, shown, max, spin, fine, size, open });
  useEffect(() => {
    props.current = { placed, live, shown, max, spin, fine, size, open };
    st.current.wake();
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Face the busiest part once, when the first towns arrive.
  useEffect(() => {
    const s = st.current;
    if (!s.started && placed.length) {
      s.started = true;
      s.lon = open.lon;
      s.lat = open.lat;
      s.wake();
    }
  }, [placed.length, open]);

  const close = !!size && fine === null;
  useEffect(() => {
    if (!close) return;
    let live2 = true;
    const t = window.setTimeout(() => {
      void import("@/content/land-fine").then((m) => {
        if (!live2) return;
        const L = decode(m.LAND_FINE);
        setFine(vectors(L));
      });
    }, 1200); // the close-up coastline, after the first picture is up
    return () => {
      live2 = false;
      clearTimeout(t);
    };
  }, [close]);

  const fly = (to: { lon: number; lat: number; s: number }) => {
    const s = st.current;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      s.lon = to.lon;
      s.lat = to.lat;
      s.s = to.s;
      s.anim = null;
    } else {
      s.anim = { t0: performance.now(), from: { lon: s.lon, lat: s.lat, s: s.s }, to: { lon: s.lon + wrap(to.lon - s.lon), lat: to.lat, s: to.s } };
    }
    s.vLon = s.vLat = 0;
    s.wake();
  };

  // The list (or a double-click) asks to turn to a town.
  useEffect(() => {
    if (!goto) return;
    const p = props.current.placed.find((q) => key(q) === goto.k);
    if (p) fly({ lon: p.lon! * D2R, lat: clamp(p.lat! * D2R, -MAX_LAT, MAX_LAT), s: 2 });
  }, [goto]);

  // The drawing loop: runs only while something moves.
  useEffect(() => {
    const canvas = cv.current;
    const holder = box.current;
    if (!canvas || !holder || !size) return;
    const s = st.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const io = new IntersectionObserver(([e]) => {
      s.visible = e.isIntersecting;
      if (s.visible) s.wake();
    });
    io.observe(holder);
    let colours = { ink: "#000", paper: "#fff", font: "sans-serif", at: 0 };

    const draw = (now: number) => {
      s.raf = 0;
      if (!s.visible) return;
      const P = props.current;
      const dt = Math.min(48, now - (s.last || now));
      s.last = now;
      let moving = false;

      if (s.anim) {
        const t = Math.min(1, (now - s.anim.t0) / 800);
        const e = ease(t);
        const { from, to } = s.anim;
        s.lon = wrap(from.lon + (to.lon - from.lon) * e);
        s.lat = from.lat + (to.lat - from.lat) * e;
        s.s = Math.exp(Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * e);
        if (t >= 1) s.anim = null;
        moving = true;
      } else if (!s.dragging && (Math.abs(s.vLon) > 1e-5 || Math.abs(s.vLat) > 1e-5)) {
        s.lon = wrap(s.lon + s.vLon * dt);
        s.lat = clamp(s.lat + s.vLat * dt, -MAX_LAT, MAX_LAT);
        const k = Math.pow(0.0025, dt / 1000); // glide to a stop in about a second
        s.vLon *= k;
        s.vLat *= k;
        moving = true;
      } else if (P.spin && !s.dragging) {
        s.lon = wrap(s.lon + 0.00006 * dt);
        moving = true;
      }
      const liveNow = P.live.size > 0;
      if (s.dragging) moving = true;

      if (now - colours.at > 1000) {
        const cs = getComputedStyle(canvas);
        colours = { ink: cs.color, paper: getComputedStyle(holder).backgroundColor, font: cs.fontFamily, at: now };
      }
      const { w, h } = P.size!;
      const R = Math.min(w, h) * 0.45 * s.s;
      const cx = w / 2;
      const cy = h / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      // the globe is a window: clip to its disc
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = colours.ink;
      ctx.globalAlpha = 0.04;
      ctx.fillRect(0, 0, w, h);

      const cl = Math.cos(s.lon);
      const sl = Math.sin(s.lon);
      const cp = Math.cos(s.lat);
      const sp = Math.sin(s.lat);
      const project = (x: number, y: number, z: number) => {
        const x1 = x * cl - z * sl;
        const z1 = x * sl + z * cl;
        const y2 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        return { x: cx + x1 * R, y: cy - y2 * R, z: z2 };
      };

      // graticule: every 30°
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = colours.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let lo = -180; lo < 180; lo += 30) {
        let pen = false;
        for (let la = -80; la <= 80; la += 4) {
          const a = la * D2R;
          const l = lo * D2R;
          const q = project(Math.cos(a) * Math.sin(l), Math.sin(a), Math.cos(a) * Math.cos(l));
          if (q.z > 0) {
            if (pen) ctx.lineTo(q.x, q.y);
            else ctx.moveTo(q.x, q.y);
            pen = true;
          } else pen = false;
        }
      }
      for (let la = -60; la <= 60; la += 30) {
        let pen = false;
        for (let lo = -180; lo <= 180; lo += 4) {
          const a = la * D2R;
          const l = lo * D2R;
          const q = project(Math.cos(a) * Math.sin(l), Math.sin(a), Math.cos(a) * Math.cos(l));
          if (q.z > 0) {
            if (pen) ctx.lineTo(q.x, q.y);
            else ctx.moveTo(q.x, q.y);
            pen = true;
          } else pen = false;
        }
      }
      ctx.stroke();

      // land: the side that faces you
      const L = P.fine && s.s > 1.25 ? P.fine : COARSE_V;
      const base = R * L.deg * D2R * 0.23;
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      const v = L.v;
      for (let i = 0; i < v.length; i += 3) {
        const x = v[i];
        const y = v[i + 1];
        const z = v[i + 2];
        const z1 = x * sl + z * cl;
        const z2 = y * sp + z1 * cp;
        if (z2 <= 0.02) continue;
        const px = cx + (x * cl - z * sl) * R;
        const py = cy - (y * cp - z1 * sp) * R;
        const r = Math.max(0.55, base * Math.max(0.4, z2));
        ctx.moveTo(px + r, py);
        ctx.arc(px, py, r, 0, 6.2832);
      }
      ctx.fillStyle = colours.ink;
      ctx.fill();
      ctx.restore();

      // the rim
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = colours.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // the towns
      s.hit = [];
      const shownKey = P.shown;
      const shownPos: { x: number; y: number; r: number } | null = shownKey ? { x: -1, y: -1, r: 0 } : null;
      const faced: { p: GPlace; x: number; y: number; z: number; r: number }[] = [];
      for (const p of P.placed) {
        const a = p.lat! * D2R;
        const l = p.lon! * D2R;
        const q = project(Math.cos(a) * Math.sin(l), Math.sin(a), Math.cos(a) * Math.cos(l));
        if (q.z <= 0.03) continue;
        const r = (5 + 9 * Math.sqrt(p.n / P.max)) * (0.85 + 0.15 * Math.min(s.s, 2.5)) * (0.7 + 0.3 * q.z);
        faced.push({ p, x: q.x, y: q.y, z: q.z, r });
      }
      const t = (now % 2200) / 2200;
      for (const f of faced) {
        const k = key(f.p);
        const on = shownKey === k;
        ctx.globalAlpha = shownKey && !on ? 0.4 : 1;
        if (P.live.has(k)) {
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r + t * 22, 0, Math.PI * 2);
          ctx.strokeStyle = colours.ink;
          ctx.globalAlpha = (1 - t) * 0.8 * (shownKey && !on ? 0.5 : 1);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = shownKey && !on ? 0.4 : 1;
        }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (on ? 1.18 : 1), 0, Math.PI * 2);
        ctx.fillStyle = colours.ink;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = colours.paper;
        ctx.stroke();
        if (f.p.city === me.city && f.p.country === me.country) {
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = colours.ink;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        s.hit.push({ k, x: f.x, y: f.y, r: Math.max(f.r, 14) });
        if (on && shownPos) {
          shownPos.x = f.x;
          shownPos.y = f.y;
          shownPos.r = f.r;
        }
      }
      ctx.globalAlpha = 1;

      // names beside the towns that have room, the biggest first
      ctx.font = `12px ${colours.font}`;
      ctx.textBaseline = "middle";
      const spots: { x: number; y: number }[] = [];
      for (const f of [...faced].sort((a, b) => b.p.n - a.p.n)) {
        if (f.z < 0.4 || key(f.p) === shownKey) continue;
        if (spots.some((o) => Math.abs(o.x - f.x) < 110 && Math.abs(o.y - f.y) < 22)) continue;
        spots.push({ x: f.x, y: f.y });
        const label = f.p.city ?? placeName(null, f.p.country);
        ctx.fillStyle = colours.paper;
        ctx.globalAlpha = 0.8;
        const tw = ctx.measureText(`${label} ${f.p.n}`).width;
        ctx.fillRect(f.x + f.r + 3, f.y - 8, tw + 6, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = colours.ink;
        ctx.fillText(label, f.x + f.r + 6, f.y);
        const lw = ctx.measureText(`${label} `).width;
        ctx.globalAlpha = 0.5;
        ctx.fillText(String(f.p.n), f.x + f.r + 6 + lw, f.y);
        ctx.globalAlpha = 1;
      }

      // the card for the town you're on
      const tip = tipEl.current;
      if (tip) {
        if (shownPos && shownPos.x >= 0) {
          tip.style.display = "block";
          const tx = clamp(shownPos.x, 100, w - 100);
          const ty = Math.max(shownPos.y - shownPos.r - 12, 78);
          tip.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -100%)`;
        } else tip.style.display = "none";
      }
      // is it still showing the opening view?
      const homeNow = Math.abs(wrap(s.lon - P.open.lon)) < 0.01 && Math.abs(s.lat - P.open.lat) < 0.01 && Math.abs(s.s - 1) < 0.01;
      setAtHome((c) => (c === homeNow ? c : homeNow));

      if (moving || liveNow) {
        // pulses at about 30 frames a second; motion at the screen's pace
        s.raf = requestAnimationFrame(moving ? draw : tick);
      } else s.last = 0;
    };
    const tick = (n: number) => {
      if (n - s.last < 33) s.raf = requestAnimationFrame(tick);
      else draw(n);
    };
    s.wake = () => {
      if (!s.raf && s.visible) s.raf = requestAnimationFrame(draw);
    };
    s.wake();
    return () => {
      cancelAnimationFrame(s.raf);
      s.raf = 0;
      io.disconnect();
      s.wake = () => {};
    };
  }, [size, me.city, me.country]);

  const down = (e: React.PointerEvent) => {
    const s = st.current;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    s.anim = null;
    if (s.pointers.size === 1) {
      s.dragging = false;
      s.vLon = s.vLat = 0;
    }
  };
  const move = (e: React.PointerEvent) => {
    const s = st.current;
    const P = props.current;
    if (!P.size) return;
    const R = Math.min(P.size.w, P.size.h) * 0.45 * s.s;
    const prev = s.pointers.get(e.pointerId);
    const r = box.current!.getBoundingClientRect();
    if (!prev) {
      if (e.pointerType === "mouse") {
        // hover: the nearest town under the pointer
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const hit = s.hit.find((h) => Math.hypot(h.x - x, h.y - y) <= h.r + 4);
        onHover(hit?.k ?? null);
      }
      return;
    }
    const now = { x: e.clientX, y: e.clientY };
    if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      const other = a === prev ? b : a;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y) || 1;
      const after = Math.hypot(now.x - other.x, now.y - other.y) || 1;
      s.s = clamp(s.s * (after / before), MIN_S, MAX_S);
      s.pointers.set(e.pointerId, now);
      s.wake();
      return;
    }
    s.pointers.set(e.pointerId, now);
    const dx = now.x - prev.x;
    const dy = now.y - prev.y;
    if (!s.dragging && Math.hypot(dx, dy) < 3) return;
    if (!s.dragging) (e.currentTarget as Element).setPointerCapture(e.pointerId);
    s.dragging = true;
    const k = 1 / Math.max(120, R);
    const dLon = -dx * k * 1.15;
    const dLat = dy * k * 1.15;
    s.lon = wrap(s.lon + dLon);
    s.lat = clamp(s.lat + dLat, -MAX_LAT, MAX_LAT);
    const dtm = Math.max(8, e.timeStamp - (s.last || e.timeStamp - 16));
    s.vLon = dLon / Math.min(dtm, 40);
    s.vLat = dLat / Math.min(dtm, 40);
    s.last = e.timeStamp;
    s.wake();
  };
  const up = (e: React.PointerEvent) => {
    const s = st.current;
    s.pointers.delete(e.pointerId);
    if (!s.pointers.size) {
      const was = s.dragging;
      s.dragging = false;
      if (!was) {
        // a tap: pin the town under it, or let go
        const r = box.current!.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const hit = s.hit.find((h) => Math.hypot(h.x - x, h.y - y) <= h.r + 6);
        onPin(hit ? (shown === hit.k ? null : hit.k) : null);
      } else if (e.pointerType === "touch") {
        s.vLon *= 0.6;
        s.vLat *= 0.6;
      }
      s.last = 0;
      s.wake();
    }
  };

  // Ctrl or ⌘ + scroll zooms; a plain scroll still scrolls the page.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const s = st.current;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setHint(true);
        clearTimeout(s.hintTimer);
        s.hintTimer = window.setTimeout(() => setHint(false), 1400);
        return;
      }
      e.preventDefault();
      s.anim = null;
      s.s = clamp(s.s * Math.exp(-e.deltaY * 0.01), MIN_S, MAX_S);
      s.wake();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      clearTimeout(s.hintTimer);
    };
  }, []);

  const focus = shown ? placed.find((p) => key(p) === shown) : null;
  const btn = "border-ink bg-paper hover:bg-ink hover:text-paper grid size-9 place-items-center border text-[18px] leading-none disabled:opacity-30";
  const pill = "border-ink bg-paper hover:bg-ink hover:text-paper border px-2.5 py-1 disabled:opacity-30";
  const zoom = (f: number) => fly({ lon: st.current.lon, lat: st.current.lat, s: clamp(st.current.s * f, MIN_S, MAX_S) });

  return (
    <div
      ref={box}
      className="border-ink/15 bg-paper relative aspect-[4/3] w-full cursor-grab touch-pan-y overflow-hidden border select-none active:cursor-grabbing sm:aspect-[16/10]"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => onHover(null)}
      onDoubleClick={() => zoom(1.8)}
    >
      <canvas ref={cv} className="text-ink absolute inset-0 size-full" role="img" aria-label={`Globe of this month's visitors: ${places.map((p) => placeName(p.city, p.country)).join(", ") || "none yet"}`} />

      <div
        ref={tipEl}
        role="status"
        className="border-ink bg-paper pointer-events-none absolute top-0 left-0 z-10 hidden w-max max-w-[17rem] border px-3 py-2 text-[13px] leading-snug shadow-[3px_3px_0_0_var(--color-ink)]"
      >
        {focus ? (
          <>
            <p className="font-semibold">{placeName(focus.city, focus.country)}</p>
            <p className="text-quiet tnum">
              {fmtNum(focus.n)} {focus.n === 1 ? "person" : "people"} · {Math.round((focus.n / (total || 1)) * 100)}% of the month
              {live.has(key(focus)) ? ` · ${live.get(key(focus))} here now` : ""}
            </p>
            <p className="text-quiet tnum">
              {dms(focus.lat!, focus.lon!)}
              {mine && focus !== mine ? ` · ${fmtNum(Math.round(km({ lat: mine.lat!, lon: mine.lon! }, { lat: focus.lat!, lon: focus.lon! })))} km from you` : focus === mine ? " · that's you" : ""}
            </p>
          </>
        ) : null}
      </div>

      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <button type="button" className={btn} aria-label="Zoom in" onClick={() => zoom(1.6)}>
          +
        </button>
        <button type="button" className={btn} aria-label="Zoom out" onClick={() => zoom(1 / 1.6)}>
          −
        </button>
      </div>
      <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-1 text-[13px]" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <button type="button" className={pill} disabled={atHome} onClick={() => fly({ lon: open.lon, lat: open.lat, s: 1 })}>
          Busiest part
        </button>
        <button type="button" className={`${pill} ${spin ? "bg-ink text-paper" : ""}`} aria-pressed={spin} onClick={() => setSpin((v) => !v)}>
          Spin
        </button>
      </div>
      <p aria-hidden className={`bg-paper/90 pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 px-3 py-1 text-[13px] transition-opacity ${hint ? "opacity-100" : "opacity-0"}`}>
        Hold Ctrl (⌘ on a Mac) and scroll to zoom
      </p>
    </div>
  );
}

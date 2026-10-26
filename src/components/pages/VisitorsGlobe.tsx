"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LAND } from "@/content/land";
import { placeName } from "@/lib/geo";
import { fmtNum } from "@/lib/time";
import { COARSE, decode, type Layer } from "./landgrid";
import { swarm } from "./swarm";

export interface GPlace {
  city: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  n: number;
}

const D2R = Math.PI / 180;
const MAX_LAT = 1.35; // radians: stop short of the poles so it never flips
const MIN_S = 0.75;
const MAX_S = 6;
const HOME_S = 1; // where it opens
const BUSIEST_S = 1.5; // where the "Busiest part" button takes you
const SPIN = 0.00007; // radians per millisecond: a turn in about 90 seconds
const EARTH_KM = 6371;
const key = (p: GPlace) => `${p.city}|${p.country}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
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

/* The sky: cloud cover on a coarse grid (from /api/sky), spread over an even scatter of points on the
   sphere and roughened with a little noise so it reads as cloud, not as a grid. */
interface SkyGrid {
  lats: number[];
  lons: number[];
  cover: number[];
}
const CLOUD_PTS = (() => {
  const n = 3200;
  const v = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.399963229728653;
    v[i * 3] = r * Math.sin(a);
    v[i * 3 + 1] = y;
    v[i * 3 + 2] = r * Math.cos(a);
  }
  return v;
})();
const hash3 = (x: number, y: number, z: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
function cloudsFrom(g: SkyGrid): { v: Float32Array; a: Float32Array; mean: number } {
  const cols = g.lons.length;
  const at = (r: number, c: number) => g.cover[clamp(r, 0, g.lats.length - 1) * cols + ((c % cols) + cols) % cols] / 100;
  const keep: number[] = [];
  const alpha: number[] = [];
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < CLOUD_PTS.length; i += 3) {
    const x = CLOUD_PTS[i];
    const y = CLOUD_PTS[i + 1];
    const z = CLOUD_PTS[i + 2];
    const lat = Math.asin(y) / D2R;
    const lon = Math.atan2(x, z) / D2R;
    const fr = (lat - g.lats[0]) / 15;
    const fc = (lon - g.lons[0]) / 15;
    const r0 = Math.floor(fr);
    const c0 = Math.floor(fc);
    const tr = fr - r0;
    const tc = fc - c0;
    const c = at(r0, c0) * (1 - tr) * (1 - tc) + at(r0 + 1, c0) * tr * (1 - tc) + at(r0, c0 + 1) * (1 - tr) * tc + at(r0 + 1, c0 + 1) * tr * tc;
    const w = Math.cos(lat * D2R);
    sum += c * w;
    wsum += w;
    // two scales of noise, so the edges are ragged
    const nz = 0.55 * hash3(Math.round(x * 22), Math.round(y * 22), Math.round(z * 22)) + 0.45 * hash3(Math.round(x * 9), Math.round(y * 9), Math.round(z * 9));
    const val = c * (0.35 + 1.1 * nz) - 0.12;
    if (val > 0.12) {
      keep.push(x, y, z);
      alpha.push(Math.min(1, val));
    }
  }
  return { v: Float32Array.from(keep), a: Float32Array.from(alpha), mean: wsum ? sum / wsum : 0 };
}

/** A few fixed stars round the globe: fractions of the canvas, made once. */
const STARS = Array.from({ length: 150 }, (_, i) => {
  const big = hash3(i, 5, 2) > 0.82;
  return { x: hash3(i, 1, 7), y: hash3(i, 2, 9), a: 0.4 + 0.5 * hash3(i, 3, 5), p: hash3(i, 4, 3) * 6.28, r: big ? 1.7 + hash3(i, 6, 1) : 0.9 + 0.7 * hash3(i, 7, 4), big };
});

const dms = (lat: number, lon: number) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? "W" : "E"}`;
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const h = Math.sin(((b.lat - a.lat) * D2R) / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(((b.lon - a.lon) * D2R) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}
/** A round length for the scale bar: 1, 2 or 5 × 10ⁿ km. */
function nice(kmMax: number) {
  const p = 10 ** Math.floor(Math.log10(kmMax));
  const m = kmMax / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

/* The sky, worked out here from the clock (standard low-precision formulas, good to about 0.01°).
   Nothing is fetched and nothing leaves the browser. */
function sunAt(ms: number) {
  const n = ms / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 4e-7 * n) * D2R;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24) * 15 * D2R;
  return { dec, lon: wrap(ra - gmst), au: 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g), tilt: eps };
}
const MOONS = ["new", "waxing crescent", "first quarter", "waxing gibbous", "full", "waning gibbous", "last quarter", "waning crescent"];
function moonAt(ms: number) {
  const age = ((((ms / 86400000 + 2440587.5 - 2451550.1) / 29.530588853) % 1) + 1) % 1;
  return { lit: (1 - Math.cos(2 * Math.PI * age)) / 2, name: MOONS[Math.round(age * 8) % 8] };
}
const sunVec = (s: { dec: number; lon: number }) => ({ x: Math.cos(s.dec) * Math.sin(s.lon), y: Math.sin(s.dec), z: Math.cos(s.dec) * Math.cos(s.lon) });
const clock = (h: number) => {
  const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

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
 * The visitors on a globe you can turn. Drawn on a canvas: land as dots, only
 * the side that faces you, in three tones for day, dusk and night, with the
 * real sun working out which. It spins the way the Earth does (eastward) and
 * the day sweeps across it; springs give it weight. A town with someone on
 * the site right now pulses. It only draws while something moves, and not at
 * all while off screen.
 */
export function VisitorsGlobe({ places, live, shown, onHover, onPin, goto, total, me, mine }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const skyEl = useRef<HTMLParagraphElement>(null);
  const coordEl = useRef<HTMLSpanElement>(null);
  const zoomEl = useRef<HTMLSpanElement>(null);
  const barEl = useRef<HTMLDivElement>(null);
  const kmEl = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [fine, setFine] = useState<{ v: Float32Array; deg: number } | null>(null);
  const [spin, setSpin] = useState(() => typeof window === "undefined" || !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hint, setHint] = useState(false);
  const [atBusiest, setAtBusiest] = useState(false);
  const [facts, setFacts] = useState("");
  const [sky, setSky] = useState<{ v: Float32Array; a: Float32Array; mean: number } | null>(null);

  const placed = useMemo(() => places.filter((p) => p.lat != null && p.lon != null), [places]);
  const max = Math.max(1, ...placed.map((p) => p.n));
  const open = useMemo(() => opening(places), [places]);

  // Everything that changes every frame lives here, not in React state.
  const st = useRef({
    lon: open.lon,
    lat: open.lat,
    s: HOME_S,
    sT: HOME_S,
    sV: 0,
    vLon: 0,
    vLat: 0,
    fly: null as null | { lon: number; lat: number },
    fVLon: 0,
    fVLat: 0,
    dragging: false,
    spinK: 1,
    last: 0,
    stamp: 0,
    ptr: null as null | { x: number; y: number },
    hov: new Map<string, number>(),
    hit: [] as { k: string; x: number; y: number; r: number }[],
    visible: true,
    raf: 0,
    wake: () => {},
    hintTimer: 0,
    pointers: new Map<number, { x: number; y: number }>(),
    started: false,
  });
  const props = useRef({ placed, live, shown, max, spin, fine, size, open, me, sky });
  useEffect(() => {
    props.current = { placed, live, shown, max, spin, fine, size, open, me, sky };
    st.current.wake();
  }, [placed, live, shown, max, spin, fine, size, open, me, sky]);

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

  const wantFine = !!size && fine === null;
  useEffect(() => {
    if (!wantFine) return;
    let alive = true;
    const t = window.setTimeout(() => {
      void import("@/content/land-fine").then((m) => alive && setFine(vectors(decode(m.LAND_FINE))));
    }, 1500); // the close-up coastline, once the first picture is up
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [wantFine]);

  // Live clouds, from our own server (which asks the weather service once every half hour for everyone).
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/sky")
        .then((r) => (r.ok ? r.json() : null))
        .then((g: SkyGrid | null) => {
          if (alive && g && Array.isArray(g.cover) && g.cover.length === g.lats.length * g.lons.length) setSky(cloudsFrom(g));
        })
        .catch(() => {});
    const t0 = window.setTimeout(load, 2500);
    const t = setInterval(load, 30 * 60_000);
    return () => {
      alive = false;
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);

  // The sun, the tilt and the moon, in words, every few seconds.
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const sun = sunAt(now);
      const moon = moonAt(now);
      setFacts(
        `Sun ${(sun.au * 149.598).toFixed(1)} million km away · overhead at ${dms(sun.dec / D2R, sun.lon / D2R)} · Earth's tilt ${(sun.tilt / D2R).toFixed(1)}° · Moon ${moon.name}, ${Math.round(moon.lit * 100)}% lit`,
      );
    };
    const first = window.setTimeout(tick, 0);
    const t = setInterval(tick, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const flyTo = (to: { lon: number; lat: number }, scale: number) => {
    const s = st.current;
    s.fly = { lon: s.lon + wrap(to.lon - s.lon), lat: clamp(to.lat, -MAX_LAT, MAX_LAT) };
    s.sT = clamp(scale, MIN_S, MAX_S);
    s.vLon = s.vLat = 0;
    s.wake();
  };

  // The list asks to turn to a town.
  useEffect(() => {
    if (!goto) return;
    const p = props.current.placed.find((q) => key(q) === goto.k);
    if (p) flyTo({ lon: p.lon! * D2R, lat: p.lat! * D2R }, 3);
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
    let colours = { ink: "#000", paper: "#fff", font: "sans-serif", at: -9999 };
    const text = (el: HTMLElement | null, v: string) => {
      if (el && el.textContent !== v) el.textContent = v;
    };
    type Proj = (x: number, y: number, z: number) => { x: number; y: number; z: number };
    const arc = (project: Proj, pts: [number, number, number][]) => {
      let pen = false;
      for (const [x, y, z] of pts) {
        const q = project(x, y, z);
        if (q.z > 0) {
          if (pen) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
          pen = true;
        } else pen = false;
      }
    };
    // the graticule never changes: its points are made once
    const grat: [number, number, number][][] = [];
    for (let lo = -180; lo < 180; lo += 30) {
      const line: [number, number, number][] = [];
      for (let la = -80; la <= 80; la += 5) line.push([Math.cos(la * D2R) * Math.sin(lo * D2R), Math.sin(la * D2R), Math.cos(la * D2R) * Math.cos(lo * D2R)]);
      grat.push(line);
    }
    for (let la = -60; la <= 60; la += 30) {
      const line: [number, number, number][] = [];
      for (let lo = -180; lo <= 180; lo += 5) line.push([Math.cos(la * D2R) * Math.sin(lo * D2R), Math.sin(la * D2R), Math.cos(la * D2R) * Math.cos(lo * D2R)]);
      grat.push(line);
    }

    const draw = (now: number) => {
      s.raf = 0;
      if (!s.visible) return;
      const P = props.current;
      const dt = clamp(now - (s.last || now - 16), 1, 48);
      s.last = now;
      const dS = dt / 1000;
      let moving = false;

      // zoom: a spring, so it overshoots a little and settles
      if (Math.abs(s.sT - s.s) > 0.002 || Math.abs(s.sV) > 0.002) {
        s.sV += (150 * (s.sT - s.s) - 16 * s.sV) * dS;
        s.s = clamp(s.s + s.sV * dS, MIN_S * 0.9, MAX_S * 1.04);
        moving = true;
      } else s.sV = 0;

      // turning to a town: a spring too
      if (s.fly && !s.dragging) {
        const eLon = wrap(s.fly.lon - s.lon);
        const eLat = s.fly.lat - s.lat;
        s.fVLon += (62 * eLon - 11 * s.fVLon) * dS;
        s.fVLat += (62 * eLat - 11 * s.fVLat) * dS;
        s.lon = wrap(s.lon + s.fVLon * dS);
        s.lat = clamp(s.lat + s.fVLat * dS, -MAX_LAT, MAX_LAT);
        if (Math.abs(eLon) < 0.0006 && Math.abs(eLat) < 0.0006 && Math.abs(s.fVLon) < 0.004 && Math.abs(s.fVLat) < 0.004) s.fly = null;
        moving = true;
      } else if (!s.dragging && (Math.abs(s.vLon) > 1e-5 || Math.abs(s.vLat) > 1e-5)) {
        // let go: it carries on, then settles
        s.lon = wrap(s.lon + s.vLon * dt);
        s.lat = clamp(s.lat + s.vLat * dt, -MAX_LAT, MAX_LAT);
        const k = Math.pow(0.004, dt / 1000);
        s.vLon *= k;
        s.vLat *= k;
        moving = true;
      }

      // the spin: eastward, like the Earth. It slows while you look at a town, to let you read and tap.
      const idle = !s.dragging && !s.fly && Math.abs(s.vLon) < 1e-4;
      const slow = P.shown || s.ptr ? 0.12 : 1;
      s.spinK += (slow - s.spinK) * Math.min(1, dt / 220);
      if (P.spin && idle) {
        const d = SPIN * dt * s.spinK;
        s.lon = wrap(s.lon - d);
        moving = true;
      }
      if (s.dragging) moving = true;
      const liveNow = P.live.size > 0;

      if (now - colours.at > 1500) {
        const cs = getComputedStyle(canvas);
        colours = { ink: cs.color, paper: getComputedStyle(holder).backgroundColor, font: cs.fontFamily, at: now };
      }
      const { w, h } = P.size!;
      const R = Math.min(w, h) * 0.46 * s.s;
      const cx = w / 2;
      const cy = h / 2;
      const cl = Math.cos(s.lon);
      const sl = Math.sin(s.lon);
      const cp = Math.cos(s.lat);
      const sp = Math.sin(s.lat);
      const project: Proj = (x, y, z) => {
        const x1 = x * cl - z * sl;
        const z1 = x * sl + z * cl;
        return { x: cx + x1 * R, y: cy - (y * cp - z1 * sp) * R, z: y * sp + z1 * cp };
      };

      // the sun, now (moved on by however far the spin has carried the day)
      const when = Date.now(); // the real sun, always: spinning the view never moves the day
      const sun = sunAt(when);
      const sv = sunVec(sun);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // stars: fixed, some bigger, all shimmering a little; the biggest get a small sparkle
      ctx.fillStyle = colours.ink;
      ctx.strokeStyle = colours.ink;
      ctx.lineWidth = 1;
      for (const st2 of STARS) {
        const sx = st2.x * w;
        const sy = st2.y * h;
        if (Math.hypot(sx - cx, sy - cy) < R * 1.1) continue;
        const tw = 0.7 + 0.3 * Math.sin(now / 900 + st2.p);
        ctx.globalAlpha = st2.a * tw;
        ctx.beginPath();
        ctx.arc(sx, sy, st2.r, 0, Math.PI * 2);
        ctx.fill();
        if (st2.big) {
          ctx.globalAlpha = st2.a * tw * 0.6;
          ctx.beginPath();
          ctx.moveTo(sx - st2.r * 3.2, sy);
          ctx.lineTo(sx + st2.r * 3.2, sy);
          ctx.moveTo(sx, sy - st2.r * 3.2);
          ctx.lineTo(sx, sy + st2.r * 3.2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = colours.ink;
      ctx.globalAlpha = 0.045;
      ctx.fillRect(0, 0, w, h);

      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = colours.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const line of grat) arc(project, line);
      ctx.stroke();

      // land: dots as zero-length round strokes (far cheaper than arcs), three tones for day, dusk and night
      const L = P.fine && s.s > 2.3 ? P.fine : COARSE_V;
      const dot = Math.max(1.1, R * L.deg * D2R * 0.46);
      const paths = [new Path2D(), new Path2D(), new Path2D()];
      const v = L.v;
      for (let i = 0; i < v.length; i += 3) {
        const x = v[i];
        const y = v[i + 1];
        const z = v[i + 2];
        const z1 = x * sl + z * cl;
        if (y * sp + z1 * cp <= 0.02) continue;
        const px = cx + (x * cl - z * sl) * R;
        const py = cy - (y * cp - z1 * sp) * R;
        if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue;
        const d = x * sv.x + y * sv.y + z * sv.z;
        const pth = paths[d > 0.07 ? 0 : d > -0.1 ? 1 : 2];
        pth.moveTo(px, py);
        pth.lineTo(px + 0.01, py);
      }
      ctx.lineCap = "round";
      ctx.lineWidth = dot;
      ctx.globalAlpha = 0.5;
      ctx.stroke(paths[0]);
      ctx.globalAlpha = 0.27;
      ctx.stroke(paths[1]);
      ctx.globalAlpha = 0.11;
      ctx.stroke(paths[2]);
      ctx.lineCap = "butt";

      // the terminator: the great circle where the day ends
      {
        let ax = sv.z;
        let az = -sv.x;
        const al = Math.hypot(ax, az) || 1;
        ax /= al;
        az /= al;
        const bx = sv.y * az;
        const by = sv.z * ax - sv.x * az;
        const bz = -sv.y * ax;
        const ring: [number, number, number][] = [];
        for (let a = 0; a <= 360; a += 4) {
          const c = Math.cos(a * D2R);
          const sn = Math.sin(a * D2R);
          ring.push([c * ax + sn * bx, sn * by, c * az + sn * bz]);
        }
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        arc(project, ring);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      // the air: a thin glow just outside the rim
      {
        const g = ctx.createRadialGradient(cx, cy, R * 0.985, cx, cy, R * 1.05);
        g.addColorStop(0, colours.ink);
        g.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
        ctx.fill();
      }

      // the rim, and the Earth's axis leaning out of it
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = colours.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      const pole = project(0, 1, 0);
      const ax = pole.x - cx;
      const ay = pole.y - cy;
      const al = Math.hypot(ax, ay);
      if (al > R * 0.12) {
        const ux = ax / al;
        const uy = ay / al;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(cx + ux * R, cy + uy * R);
        ctx.lineTo(cx + ux * R * 1.1, cy + uy * R * 1.1);
        ctx.moveTo(cx - ux * R, cy - uy * R);
        ctx.lineTo(cx - ux * R * 1.1, cy - uy * R * 1.1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // the sun overhead, when it faces us
      const sp3 = project(sv.x, sv.y, sv.z);
      if (sp3.z > 0.05) {
        ctx.strokeStyle = colours.ink;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(sp3.x, sp3.y, 5, 0, Math.PI * 2);
        for (let a = 0; a < 8; a++) {
          const c = Math.cos((a * Math.PI) / 4);
          const sn = Math.sin((a * Math.PI) / 4);
          ctx.moveTo(sp3.x + c * 8, sp3.y + sn * 8);
          ctx.lineTo(sp3.x + c * 12, sp3.y + sn * 12);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // the towns
      s.hit = [];
      const shownKey = P.shown;
      const shownPos = { x: -1, y: -1, r: 0, lat: 0, lon: 0 };
      const faced: { p: GPlace; x: number; y: number; z: number; r: number; k: string }[] = [];
      for (const p of P.placed) {
        const a = p.lat! * D2R;
        const l = p.lon! * D2R;
        const q = project(Math.cos(a) * Math.sin(l), Math.sin(a), Math.cos(a) * Math.cos(l));
        if (q.z <= 0.03) continue;
        const k = key(p);
        // a dot springs up when you're on it
        const target = shownKey === k ? 1 : 0;
        const cur = s.hov.get(k) ?? 0;
        const nxt = cur + (target - cur) * Math.min(1, dt / 90);
        s.hov.set(k, nxt);
        if (Math.abs(nxt - target) > 0.01) moving = true;
        const r = swarm(p.n).reach * (0.9 + 0.1 * Math.min(s.s, 2.5)) * (0.72 + 0.28 * q.z) * (1 + 0.15 * nxt);
        faced.push({ p, x: q.x, y: q.y, z: q.z, r, k });
      }
      const t = (now % 2200) / 2200;
      for (const f of faced) {
        const on = shownKey === f.k;
        const fade = shownKey && !on ? 0.4 : 1;
        const sw = swarm(f.p.n);
        const kk = f.r / sw.reach; // the swarm shrinks a little toward the limb and grows when you're on it
        const liveCount = P.live.get(f.k) ?? 0;
        for (let i = 0; i < sw.pts.length; i++) {
          const d = sw.pts[i];
          const dx = f.x + d.x * kk;
          const dy = f.y + d.y * kk;
          const dr = sw.dot * kk;
          if (i < liveCount) {
            ctx.beginPath();
            ctx.arc(dx, dy, dr + t * 12, 0, Math.PI * 2);
            ctx.strokeStyle = colours.ink;
            ctx.globalAlpha = (1 - t) * 0.8 * fade;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          ctx.globalAlpha = fade;
          ctx.beginPath();
          ctx.arc(dx, dy, dr, 0, Math.PI * 2);
          ctx.fillStyle = colours.ink;
          ctx.fill();
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = colours.paper;
          ctx.stroke();
        }
        ctx.globalAlpha = fade;
        s.hit.push({ k: f.k, x: f.x, y: f.y, r: Math.max(f.r, 14) });
        if (on) Object.assign(shownPos, { x: f.x, y: f.y, r: f.r, lat: f.p.lat!, lon: f.p.lon! });
      }
      ctx.globalAlpha = 1;

      // names beside the towns that have room, the biggest first
      ctx.font = `12px ${colours.font}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const spots: { x: number; y: number }[] = [];
      for (const f of [...faced].sort((a, b) => b.p.n - a.p.n)) {
        if (f.z < 0.3 || f.k === shownKey) continue;
        if (f.x < 0 || f.x > w || f.y < 0 || f.y > h) continue;
        if (spots.some((o) => Math.abs(o.x - f.x) < 96 && Math.abs(o.y - f.y) < 17)) continue;
        spots.push({ x: f.x, y: f.y });
        const label = f.p.city ?? placeName(null, f.p.country);
        const count = String(f.p.n);
        const lw = ctx.measureText(`${label} `).width;
        ctx.fillStyle = colours.paper;
        ctx.globalAlpha = 0.82;
        ctx.fillRect(f.x + f.r + 3, f.y - 8, lw + ctx.measureText(count).width + 6, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = colours.ink;
        ctx.fillText(label, f.x + f.r + 6, f.y);
        ctx.globalAlpha = 0.5;
        ctx.fillText(count, f.x + f.r + 6 + lw, f.y);
        ctx.globalAlpha = 1;
      }

      // the card for the town you're on, with its sky
      const tip = tipEl.current;
      if (tip) {
        if (shownPos.x >= 0) {
          tip.style.display = "block";
          tip.style.transform = `translate(${clamp(shownPos.x, 100, w - 100)}px, ${Math.max(shownPos.y - shownPos.r - 12, 100)}px) translate(-50%, -100%)`;
          const a = shownPos.lat * D2R;
          const l = shownPos.lon * D2R;
          const el = Math.asin(clamp(Math.cos(a) * Math.sin(l) * sv.x + Math.sin(a) * sv.y + Math.cos(a) * Math.cos(l) * sv.z, -1, 1)) / D2R;
          const utcH = (((when / 3600000) % 24) + 24) % 24;
          text(skyEl.current, `${el > 0 ? "Day" : el > -6 ? "Dusk" : "Night"} there · sun ${Math.abs(el).toFixed(0)}° ${el >= 0 ? "up" : "below"} · ${clock(utcH + shownPos.lon / 15)} by the sun`);
        } else tip.style.display = "none";
      }

      // the scale (at the middle of the disc), the zoom, and the coordinates under the pointer
      const kmPx = EARTH_KM / R;
      const bar = nice(kmPx * 110);
      if (barEl.current) barEl.current.style.width = `${(bar / kmPx).toFixed(1)}px`;
      text(kmEl.current, `${fmtNum(bar)} km`);
      text(zoomEl.current, `×${s.s.toFixed(1)}`);
      if (s.ptr) {
        const nx = (s.ptr.x - cx) / R;
        const ny = (cy - s.ptr.y) / R;
        const rr = nx * nx + ny * ny;
        if (rr <= 1) {
          const z2 = Math.sqrt(1 - rr);
          const y1 = ny * cp + z2 * sp;
          const z1 = -ny * sp + z2 * cp;
          const wx = nx * cl + z1 * sl;
          const wz = z1 * cl - nx * sl;
          text(coordEl.current, dms(Math.asin(clamp(y1, -1, 1)) / D2R, Math.atan2(wx, wz) / D2R));
        } else text(coordEl.current, "");
      } else text(coordEl.current, `${dms(s.lat / D2R, s.lon / D2R)} · centre`);

      const homeNow = Math.abs(wrap(s.lon - P.open.lon)) < 0.01 && Math.abs(s.lat - P.open.lat) < 0.01 && Math.abs(s.s - BUSIEST_S) < 0.05;
      setAtBusiest((c) => (c === homeNow ? c : homeNow));

      if (moving) s.raf = requestAnimationFrame(draw);
      else if (liveNow) s.raf = requestAnimationFrame(tick);
      else s.last = 0;
    };
    // pulses alone need about 30 frames a second, not 60
    const tick = (n: number) => {
      if (n - s.last < 32) s.raf = requestAnimationFrame(tick);
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
  }, [size]);

  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    const s = st.current;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    s.fly = null;
    if (s.pointers.size === 1) {
      s.dragging = false;
      s.vLon = s.vLat = 0;
    }
  };
  const move = (e: React.PointerEvent) => {
    const s = st.current;
    const P = props.current;
    if (!P.size) return;
    const R = Math.min(P.size.w, P.size.h) * 0.46 * s.s;
    const prev = s.pointers.get(e.pointerId);
    const at = local(e);
    if (e.pointerType === "mouse") {
      s.ptr = at;
      s.wake();
    }
    if (!prev) {
      if (e.pointerType === "mouse") {
        const hit = s.hit.find((h) => Math.hypot(h.x - at.x, h.y - at.y) <= h.r + 4);
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
      s.s = s.sT = clamp(s.s * (after / before), MIN_S, MAX_S);
      s.sV = 0;
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
    const k = 1 / Math.max(140, R);
    const dLon = -dx * k * 1.1;
    const dLat = dy * k * 1.1;
    s.lon = wrap(s.lon + dLon);
    s.lat = clamp(s.lat + dLat, -MAX_LAT, MAX_LAT);
    const dtm = clamp(e.timeStamp - s.stamp, 8, 40);
    s.stamp = e.timeStamp;
    s.vLon = dLon / dtm;
    s.vLat = dLat / dtm;
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
        const at = local(e);
        const hit = s.hit.find((h) => Math.hypot(h.x - at.x, h.y - at.y) <= h.r + 6);
        onPin(hit ? (shown === hit.k ? null : hit.k) : null);
      }
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
      s.sT = clamp(s.sT * Math.exp(-e.deltaY * 0.01), MIN_S, MAX_S);
      s.wake();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      clearTimeout(s.hintTimer);
    };
  }, []);

  const focus = shown ? placed.find((p) => key(p) === shown) : null;
  const btn = "border-ink bg-paper hover:bg-ink hover:text-paper grid size-9 place-items-center border text-[18px] leading-none transition-transform active:scale-90";
  const pill = "border-ink bg-paper hover:bg-ink hover:text-paper border px-2.5 py-1 transition-transform active:scale-95 disabled:opacity-30";
  const zoom = (f: number) => {
    const s = st.current;
    s.sT = clamp(s.sT * f, MIN_S, MAX_S);
    s.wake();
  };

  return (
    <>
      <div
        ref={box}
        className="bg-paper relative aspect-[5/6] w-full cursor-grab touch-pan-y overflow-hidden select-none active:cursor-grabbing sm:aspect-[16/11]"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={() => {
          st.current.ptr = null;
          st.current.wake();
          onHover(null);
        }}
        onDoubleClick={() => zoom(1.8)}
      >
        <canvas ref={cv} className="text-ink absolute inset-0 size-full [mask-image:radial-gradient(ellipse_at_center,#000_80%,transparent_100%)]" role="img" aria-label={`Globe of this month's visitors: ${places.map((p) => placeName(p.city, p.country)).join(", ") || "none yet"}`} />

        <div
          ref={tipEl}
          role="status"
          className="border-ink bg-paper pointer-events-none absolute top-0 left-0 z-10 hidden w-max max-w-[19rem] border px-3 py-2 text-[13px] leading-snug shadow-[3px_3px_0_0_var(--color-ink)]"
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
              <p ref={skyEl} className="text-quiet tnum" />
            </>
          ) : null}
        </div>

        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          <button type="button" className={btn} aria-label="Zoom in" onClick={() => zoom(1.7)}>
            +
          </button>
          <button type="button" className={btn} aria-label="Zoom out" onClick={() => zoom(1 / 1.7)}>
            −
          </button>
        </div>
        <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-1 text-[13px]" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
          <button type="button" className={pill} disabled={atBusiest} onClick={() => flyTo(open, BUSIEST_S)}>
            Busiest part
          </button>
          <button type="button" className={spin ? pill.replace("bg-paper", "bg-ink text-paper").replace("hover:bg-ink hover:text-paper", "") : pill} aria-pressed={spin} onClick={() => setSpin((v) => !v)}>
            {spin ? "Spinning" : "Spin"}
          </button>
        </div>
        <div className="pointer-events-none absolute right-2 bottom-2 z-10 text-right text-[12px] leading-none">
          <p className="tnum text-quiet mb-1">
            <span ref={coordEl} /> · <span ref={zoomEl} />
          </p>
          <div ref={barEl} className="border-ink ml-auto h-1.5 border-x border-b" />
          <p className="tnum mt-1">
            <span ref={kmEl} /> <span className="text-quiet">at the middle</span>
          </p>
        </div>
        <p aria-hidden className={`bg-paper/90 pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 px-3 py-1 text-[13px] transition-opacity ${hint ? "opacity-100" : "opacity-0"}`}>
          Hold Ctrl (⌘ on a Mac) and scroll to zoom
        </p>
      </div>
      {facts ? (
        <p className="text-quiet tnum mt-2 text-[13px]">
          {facts}
          {sky ? ` · Clouds cover about ${Math.round(sky.mean * 100)}% of the planet right now` : ""}
        </p>
      ) : null}
    </>
  );
}

/**
 * The colours of /now follow the sky where I am: white by day, warm around
 * sunrise and sunset, dark at night, a little greyer under cloud or rain.
 * Ink is chosen for contrast with whatever the paper has become, never
 * blended, so the text always reads.
 */
type RGB = [number, number, number];

const NIGHT: RGB = [13, 16, 21];
const DAY: RGB = [255, 255, 255];
const GOLD: RGB = [246, 230, 208];
// The two sides of twilight. Paper never sits in the mid-greys between them,
// where no ink reads well; it crosses over once, and the page fades across.
const DUSKY: RGB = [44, 36, 52];
const PALE: RGB = [226, 212, 196];
const OVERCAST: RGB = [238, 239, 240];
const DARK_INK: RGB = [0, 0, 0];
const WARM_INK: RGB = [28, 20, 12];
const LIGHT_INK: RGB = [236, 232, 225];

const MIN = 60_000;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t)))) as RGB;
const hex = (c: RGB) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const luminance = ([r, g, b]: RGB) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

export interface Sky {
  phase: "night" | "dawn" | "day" | "dusk";
  paper: string;
  ink: string;
  quiet: string;
  /** 0 at night, 1 in full daylight. */
  light: number;
  stars: boolean;
  rain: boolean;
}

export function skyAt(now: number, sun: { rise: number; set: number }[], { cloud = 0, rain = false }: { cloud?: number | null; rain?: boolean } = {}): Sky {
  // The sunrise and sunset nearest to now.
  const rise = sun.map((s) => s.rise).sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
  const set = sun.map((s) => s.set).sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
  let light = 1;
  if (rise != null && set != null) {
    // Light comes up from 50 min before sunrise to 40 after, and goes from 40 before sunset to 50 after.
    const up = (now - (rise - 50 * MIN)) / (90 * MIN);
    const down = ((set + 50 * MIN) - now) / (90 * MIN);
    light = Math.min(1, Math.max(0, Math.abs(now - rise) < Math.abs(now - set) ? up : down));
    if (now > set + 50 * MIN || now < rise - 50 * MIN) light = 0;
  }
  const warmth = Math.max(0, 1 - Math.min(Math.abs(now - (rise ?? -1e15)), Math.abs(now - (set ?? -1e15))) / (60 * MIN));
  const grey = Math.min(1, Math.max(0, ((cloud ?? 0) - 40) / 60)) * 0.6 + (rain ? 0.4 : 0);

  let paper = light < 0.5 ? mix(NIGHT, DUSKY, light * 2) : mix(PALE, DAY, (light - 0.5) * 2);
  if (light >= 0.5) {
    paper = mix(paper, GOLD, warmth * 0.85);
    paper = mix(paper, OVERCAST, grey);
  }

  const dark = luminance(paper) < 0.4;
  const ink = dark ? LIGHT_INK : warmth > 0.3 ? WARM_INK : DARK_INK;
  const quiet = mix(ink, paper, 0.45);
  const nearRise = rise != null && set != null && Math.abs(now - rise) < Math.abs(now - set);
  const phase = light === 0 ? "night" : light === 1 && warmth < 0.2 ? "day" : nearRise ? "dawn" : "dusk";

  return { phase, paper: hex(paper), ink: hex(ink), quiet: hex(quiet), light, stars: light < 0.15 && (cloud ?? 0) < 50 && !rain, rain };
}

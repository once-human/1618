import { LAND } from "@/content/land";

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** The land as bits, to draw only what's on screen: a canvas, not tens of thousands of SVG dots. */

export interface Layer {
  c: number; // cell size in map units
  cols: number;
  rows: number;
  bits: Uint8Array;
}
export function decode(land: { step: number; rows: string[] }): Layer {
  const cols = 360 / land.step;
  const bits = new Uint8Array(cols * land.rows.length);
  land.rows.forEach((row, y) => {
    let x = 0;
    for (const ch of row) {
      const v = A.indexOf(ch);
      for (let b = 5; b >= 0 && x < cols; b--, x++) bits[y * cols + x] = (v >> b) & 1;
    }
  });
  return { c: land.step / LAND.step, cols, rows: land.rows.length, bits };
}
export const COARSE = decode(LAND);

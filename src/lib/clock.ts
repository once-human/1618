/** Tiny external store for the time-of-day indicator (minutes since midnight). */
let minutes = 6 * 60 + 59;
const subs = new Set<() => void>();

export function setClock(m: number) {
  const r = Math.round(m);
  if (r === minutes) return;
  minutes = r;
  subs.forEach((f) => f());
}

export const getClock = () => minutes;

export function subscribeClock(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

export function formatClock(m: number) {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

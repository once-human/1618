/**
 * Turn commit times into work sessions: commits less than `gap` apart belong
 * to one sitting, which starts `lead` before its first commit (the work that
 * led up to it) and ends `tail` after its last.
 */
export interface Session {
  from: number;
  to: number;
  commits: number;
}

export function sessions(times: number[], { gap = 2 * 3600, lead = 45 * 60, tail = 10 * 60 } = {}): Session[] {
  const sorted = [...new Set(times)].filter(Number.isFinite).sort((a, b) => a - b);
  const out: Session[] = [];
  for (const t of sorted) {
    const last = out.at(-1);
    if (last && t - (last.to - tail) <= gap) {
      last.to = t + tail;
      last.commits++;
    } else {
      // Never let a new sitting reach back into the previous one.
      out.push({ from: Math.max(t - lead, last ? last.to : -Infinity), to: t + tail, commits: 1 });
    }
  }
  return out;
}

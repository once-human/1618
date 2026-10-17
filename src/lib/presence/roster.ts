/**
 * Who's here, merged from two signals that disagree for a moment:
 *
 * - Presence: the realtime server's own list of open tabs. It is the truth
 *   (it notices a tab that dies without a word), but every change reaches
 *   other people about 2.5 seconds late.
 * - Broadcast: each tab says "hi" when it arrives and "bye" when it leaves.
 *   These land in milliseconds, so the number moves straight away.
 *
 * Broadcasts are only ever a head start: each is dropped the moment presence
 * agrees, and forgotten after a few seconds if presence never does, so a lost
 * or bogus message can't leave the count wrong for long.
 */

export interface Here {
  /** Distinct browsers on the site, you included. */
  people: number;
  /** Open tabs across all of them. */
  tabs: number;
  /** How many of those tabs are yours. */
  mine: number;
}

/** How long a "hi" or "bye" may run ahead of presence before it's ignored. */
const HOLD = 8_000;
/**
 * A "bye" that would make a whole person disappear waits this long first: if
 * it was a reload, the same browser says "hi" again before anyone sees a dip.
 */
const RELOAD_GRACE = 1_500;
const MAX_PENDING = 500;

export class Roster {
  /** tab → browser, as presence last reported it */
  private confirmed = new Map<string, string>();
  /** tabs that said hi but presence hasn't shown yet */
  private joins = new Map<string, { b: string; until: number }>();
  /** tabs that said bye but presence still shows; they count until `from` */
  private leaves = new Map<string, { from: number; until: number }>();
  /** someone's last tab, just dropped by presence: kept briefly in case it's a reload */
  private fading = new Map<string, { b: string; until: number }>();

  constructor(private readonly me: string) {}

  /** Presence's full view: browser → its tab ids. */
  sync(state: Record<string, readonly string[]>, now: number) {
    const before = this.live(now);
    this.confirmed.clear();
    for (const b in state) for (const t of state[b]) this.confirmed.set(t, b);
    for (const t of this.joins.keys()) if (this.confirmed.has(t)) this.joins.delete(t);
    for (const t of this.fading.keys()) if (this.confirmed.has(t)) this.fading.delete(t);
    // Presence can drop a reloading tab before the new page says hi. If that
    // takes a person's last tab, hold it for the reload grace, unless a bye
    // already started (or used up) that grace.
    for (const [t, b] of before) {
      if (this.confirmed.has(t) || this.joins.has(t)) continue;
      const leave = this.leaves.get(t);
      const until = leave ? leave.from : now + RELOAD_GRACE;
      if (until > now && !this.othersOf(b, t, now)) this.fading.set(t, { b, until });
    }
    for (const t of this.leaves.keys()) if (!this.confirmed.has(t)) this.leaves.delete(t);
  }

  hi(t: string, b: string, now: number) {
    this.leaves.delete(t);
    this.fading.delete(t);
    if (this.confirmed.has(t) || this.joins.size >= MAX_PENDING) return;
    this.joins.set(t, { b, until: now + HOLD });
  }

  bye(t: string, now: number) {
    const b = this.confirmed.get(t) ?? this.joins.get(t)?.b;
    if (!b) return;
    const wait = this.othersOf(b, t, now) ? 0 : RELOAD_GRACE;
    const join = this.joins.get(t);
    if (join) {
      if (wait) join.until = Math.min(join.until, now + wait);
      else this.joins.delete(t);
    }
    if (this.confirmed.has(t) && this.leaves.size < MAX_PENDING)
      this.leaves.set(t, { from: now + wait, until: now + HOLD });
  }

  /** The count as of `now`. */
  count(now: number): Here {
    const tabs = this.live(now);
    const people = new Set(tabs.values());
    let mine = 0;
    for (const b of tabs.values()) if (b === this.me) mine++;
    return { people: people.size, tabs: tabs.size, mine };
  }

  /** When the count will next change by itself (a grace or hold running out), if ever. */
  nextChange(now: number): number | null {
    let next = Infinity;
    for (const j of this.joins.values()) next = Math.min(next, j.until);
    for (const l of this.leaves.values()) next = Math.min(next, l.from > now ? l.from : l.until);
    for (const f of this.fading.values()) next = Math.min(next, f.until);
    return Number.isFinite(next) ? next : null;
  }

  private live(now: number): Map<string, string> {
    for (const [t, j] of this.joins) if (j.until <= now) this.joins.delete(t);
    for (const [t, l] of this.leaves) if (l.until <= now) this.leaves.delete(t);
    for (const [t, f] of this.fading) if (f.until <= now) this.fading.delete(t);
    const tabs = new Map(this.confirmed);
    for (const [t, f] of this.fading) tabs.set(t, f.b);
    for (const [t, j] of this.joins) tabs.set(t, j.b);
    for (const [t, l] of this.leaves) if (l.from <= now) tabs.delete(t);
    return tabs;
  }

  private othersOf(b: string, except: string, now: number) {
    for (const [t, owner] of this.live(now)) if (owner === b && t !== except) return true;
    return false;
  }
}

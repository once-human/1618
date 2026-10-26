/**
 * Who actually made a song, and what it's actually called.
 *
 * Scrobbles carry one credit string ("Romy & Fred again..", "A, B feat. C")
 * and a title that often hides more artists ("Song (feat. D)") or store
 * clutter ("[Mixed]", "- Remastered 2011"). This turns them into a clean
 * title and a list of individual artists, so rankings count real artists
 * and real songs. Pure functions, unit-tested in credits.test.ts.
 */

/** A stable identity for a name: case, accents, punctuation and spacing don't matter. */
export function nameKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Between artists in a credit.
const SEPARATORS = /\s*(?:,|;|\s&\s|\s\+\s|\s+x\s+|\s+×\s+|\s+(?:feat\.?|ft\.?|featuring|with|vs\.?|versus)\s+)\s*/i;

// "(feat. X)", "[ft. X & Y]", "(with X)" inside a title.
const TITLE_FEATURE = /\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\s+([^)\]]+)[)\]]/gi;
// "Song feat. X" with no brackets, at the end of the title.
const TRAILING_FEATURE = /\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$/i;

// "(Fred again.. Remix)": the remixer is an artist on the song too.
const REMIXER = /[([]\s*([^)\]]+?)\s+(?:remix|rework|flip|bootleg)\s*[)\]]/gi;
const NOT_A_NAME = /^(?:original|radio|club|extended|official|vip|dub|acoustic|instrumental|live|studio|album|single|the|a)$/i;

// Store and mix clutter that doesn't make a different recording.
const CLUTTER = [
  /\s*[([](?:mixed|mix cut|mixed version)[)\]]/gi,
  /\s*[([](?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?[)\]]/gi,
  /\s+-\s+(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?$/i,
  /\s*[([](?:explicit|clean|album version|single version|original version)[)\]]/gi,
  /\s+-\s+(?:explicit|single version|album version)$/i,
];

export interface Credit {
  /** The title without featured artists or clutter. */
  title: string;
  /** Every artist on the song, main artists first, each once. */
  artists: string[];
  keys: string[];
  /** "A, B & C" for display. */
  credit: string;
  /** Same song across versions of its title and order of credits. */
  songKey: string;
}

/** Split a credit string into artists, unless it's a single act whose name contains "&" etc. */
export function splitCredit(credit: string, isSingleAct: (s: string) => boolean = () => false): string[] {
  const whole = credit.trim();
  if (!whole) return [];
  if (isSingleAct(whole)) return [whole];
  const parts = whole.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);
  // A part can itself be a known act ("A & B" inside "A & B, C") — only possible
  // when the whole was split at commas first, so re-join pairs that are known.
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const pair = i + 1 < parts.length ? `${parts[i]} & ${parts[i + 1]}` : null;
    if (pair && isSingleAct(pair)) {
      out.push(pair);
      i++;
    } else out.push(parts[i]);
  }
  return out;
}

export function joinCredit(artists: string[]): string {
  if (artists.length <= 1) return artists[0] ?? "";
  return `${artists.slice(0, -1).join(", ")} & ${artists[artists.length - 1]}`;
}

export function parseCredit(rawTitle: string, rawCredit: string, isSingleAct?: (s: string) => boolean): Credit {
  let title = rawTitle.trim();
  const featured: string[] = [];

  title = title.replace(TITLE_FEATURE, (_, names: string) => {
    featured.push(...splitCredit(names, isSingleAct));
    return "";
  });
  const trailing = title.match(TRAILING_FEATURE);
  if (trailing) {
    featured.push(...splitCredit(trailing[1], isSingleAct));
    title = title.slice(0, trailing.index).trim();
  }
  for (const m of title.matchAll(REMIXER)) {
    const who = m[1].trim();
    if (who && !NOT_A_NAME.test(who)) featured.push(...splitCredit(who, isSingleAct));
  }
  for (const re of CLUTTER) title = title.replace(re, "");
  title = title.replace(/\s{2,}/g, " ").trim() || rawTitle.trim();

  const all = [...splitCredit(rawCredit, isSingleAct), ...featured];
  const artists: string[] = [];
  const keys: string[] = [];
  for (const a of all) {
    const k = nameKey(a);
    if (!k || keys.includes(k)) continue;
    keys.push(k);
    artists.push(a.replace(/\s+/g, " ").trim());
  }

  return {
    title,
    artists,
    keys,
    credit: joinCredit(artists),
    songKey: `${nameKey(title)}|${[...keys].sort().join("+")}`,
  };
}

/** Does a credit string contain anything that might separate two artists? */
export const mightBeSeveral = (credit: string) => SEPARATORS.test(credit);

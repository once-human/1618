/**
 * Pure song matching: is this Apple Music result the same recording that was
 * played? No I/O here, so it is unit-tested in match.test.ts.
 */

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop accent marks without splitting the word: "marín" -> "marin"
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "Song Name (Someone Remix)" -> "Song Name", "Song Name - Remastered" -> "Song Name". */
export const baseTitle = (s: string) => s.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "").trim();

export interface ItunesResult {
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
}

/* ---- Matching: decide whether an Apple result is the same recording ---- */

/** "Artist One, Artist Two & Three" -> ["artist one", "artist two", "three"]. */
export const splitArtists = (s: string) =>
  s
    .split(/,|&|\+| x | and | feat\.? | ft\.? | featuring | with /i)
    .map(norm)
    .filter((a) => a.length >= 1);

/** Jaro-Winkler similarity, 0..1. Forgiving of small spelling differences. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false);
  const bm = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

const words = (s: string) => norm(s).split(" ").filter(Boolean);

/**
 * Similarity of two names or titles, 0..1, compared word by word, never as raw
 * substrings: a short name like "ana" never matches inside "banana". Every word of the shorter name
 * has to find a near-identical word in the longer one.
 */
export function nameSim(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const [short, long] = words(a).length <= words(b).length ? [words(a), words(b)] : [words(b), words(a)];
  const covered = short.filter((w) => long.some((v) => v === w || (w.length > 3 && jaroWinkler(w, v) >= 0.94))).length;
  const wordScore = covered / long.length; // all words shared -> 1, extra words lower it
  // Same letters, different spacing ("DJ Snake" / "DJSnake") is the same name.
  if (na.replace(/ /g, "") === nb.replace(/ /g, "")) return Math.max(wordScore, 0.97);
  // Whole-name fuzziness only between names with the same number of words, so
  // a typo is forgiven but "Ana Lis" never turns into "Analise".
  const whole = short.length === long.length ? jaroWinkler(na, nb) : 0;
  return Math.max(wordScore, whole >= 0.93 ? whole : 0);
}

const VERSION_WORDS = /\b(remix|mix|edit|live|acoustic|remaster(ed)?|version|sped up|slowed|reverb|instrumental|extended|vip|demo|radio|unplugged|rework|bootleg|flip|cover)\b/;

/** The version part of a title, e.g. "someone remix" from "Song Name (Someone REMIX)". */
function versionOf(title: string): string {
  const parts = [...title.matchAll(/[([](.*?)[)\]]/g)].map((m) => m[1]);
  const dash = title.match(/\s+-\s+(.*)$/)?.[1];
  if (dash) parts.push(dash);
  return norm(parts.filter((p) => VERSION_WORDS.test(norm(p))).join(" "));
}

export const stripRelease = (s: string) => baseTitle(s.replace(/\s+-\s+(single|ep)$/i, ""));

/**
 * How sure we are that an Apple result is the song that was played, 0..1.
 * Zero means "definitely not": wrong artist, wrong title, or wrong version.
 */
export function matchScore(r: ItunesResult, track: string, artists: string[], album: string | null): number {
  // Title: the base title must be essentially the same.
  const title = nameSim(baseTitle(r.trackName), baseTitle(track));
  if (title < 0.85) return 0;

  // Version: a remix only matches that remix, an original only an original.
  const vMine = versionOf(track);
  const vTheirs = versionOf(r.trackName);
  let version = 1;
  if (vMine || vTheirs) {
    if (!vMine || !vTheirs) return 0;
    version = nameSim(vMine, vTheirs);
    if (version < 0.6) return 0;
  }

  // Artists: share of the played song's artists found, as whole names, on Apple's credit.
  const theirs = splitArtists(r.artistName);
  const found = artists.filter((a) => theirs.some((b) => nameSim(a, b) >= 0.9)).length;
  if (!found) return 0;
  // Catalogs often credit only the main artist(s), so measure against the
  // shorter credit list: "Main Artist" alone fully covers "Main Artist & Guest".
  const artistScore = found / Math.min(artists.length, Math.max(theirs.length, 1));

  // Album: a strong extra signal when both sides know it.
  const albumScore = album && r.collectionName ? nameSim(stripRelease(album), stripRelease(r.collectionName)) : 0.5;

  return 0.4 * title + 0.35 * artistScore + 0.15 * version + 0.1 * albumScore;
}

export const ACCEPT = 0.8;

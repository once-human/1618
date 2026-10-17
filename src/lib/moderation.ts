/**
 * A light, human filter for what visitors post. It catches the obvious stuff
 * (links, slurs, explicit words, ASCII drawings, floods, copy-paste spam) and
 * says no like a person would. It also tidies rather than rejects where it
 * can: SHOUTING becomes lowercase, "sooooooooo" becomes "sooo".
 *
 * Nothing filters perfectly. Anything that slips through can be hidden from
 * /admin in one tap.
 */

export type Verdict = { ok: true; text: string } | { ok: false; reason: string };

const pick = (options: string[]) => options[Math.floor(Math.random() * options.length)];

/** Undo the usual disguises: l33t speak, spacing, repeated letters. */
function flatten(s: string): string {
  return s
    .toLowerCase()
    .replace(/[0@4]/g, (c) => ({ "0": "o", "@": "a", "4": "a" })[c]!)
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");
}

// Kept short and blunt on purpose: these are the words that make a guestbook ugly.
const BLOCKED = [
  "faggot", "fagot", "retard", "chink", "kike", "spic", "tranny",
  "cunt", "dick", "cock", "pussy", "penis", "vagina", "boob", "tits", "porn", "nude", "nudes",
  "sex", "horny", "cum", "jizz", "blowjob", "handjob", "fuckyou", "motherfucker", "whore", "slut",
  "rape", "rapist", "bhenchod", "behenchod", "madarchod", "chutiya", "chutia", "bhosdi", "lund", "randi", "gaand",
  "killyourself", "kys",
].map((w) => w.replace(/(.)\1+/g, "$1"));

// Short words that are only a problem on their own, not inside other words ("cum" in "document").
const WHOLE_WORD = new Set([
  "cum", "sex", "kys", "lund", "dick", "cock", "tits", "boob", "nude", "spic", "kike", "porn", "rape", "randi", "gaand", "chink",
]);

// Matched before letters are collapsed, so "Niger" and "Nigam" stay fine.
const N_WORD = /n[\s._-]*[i1!|y][\s._-]*[gq6][\s._-]*[gq6]+[\s._-]*(?:a|e|3|u)[\s._-]*(?:r|h|z|s)?/i;

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|in|xyz|ru|ly|gg|me|co|app|dev|link|site|shop|top)\b)/i;

/** Drawings: 8===D and friends, or text that's mostly symbols. */
function looksLikeArt(s: string): boolean {
  if (/[8B({][=\-~]{2,}[D>)]/.test(s) || /[(][ _.]*[)][(][ _.]*[)]/.test(s)) return true;
  const visible = s.replace(/\s/g, "");
  if (visible.length < 8) return false;
  const symbols = visible.replace(/[\p{L}\p{N}\p{Extended_Pictographic}]/gu, "").length;
  return symbols / visible.length > 0.45 || s.split("\n").length > 6;
}

export function moderate(raw: string, { max = 280, required = true, links = false } = {}): Verdict {
  let text = raw.replace(/\r/g, "").trim();
  if (!text) {
    return required ? { ok: false, reason: pick(["say something first 🙂", "it's empty. type a thing?"]) } : { ok: true, text: "" };
  }
  if (text.length > max) return { ok: false, reason: `bit long. keep it under ${max} characters?` };
  if (!links && LINK.test(text)) return { ok: false, reason: pick(["no links here, just words 🙂", "links get eaten. say it in words?"]) };
  if (looksLikeArt(text)) return { ok: false, reason: pick(["nice try, artist 🙃", "no drawings please, words only"]) };

  const words = text.toLowerCase().split(/[^\p{L}\p{N}@$!|]+/u).map(flatten).filter(Boolean);
  const joined = flatten(text);
  const hit = N_WORD.test(text) || BLOCKED.some((w) => (WHOLE_WORD.has(w) ? words.includes(w) : joined.includes(w)));
  if (hit) return { ok: false, reason: pick(["nah, not posting that one 🙃", "keep it kind? this one's not going up.", "lol no"]) };

  // Tidy instead of refusing.
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length > 10 && letters.replace(/[^\p{Lu}]/gu, "").length / letters.length > 0.7) text = text.toLowerCase();
  text = text.replace(/(.)\1{4,}/gu, "$1$1$1").replace(/\n{3,}/g, "\n\n");
  return { ok: true, text };
}

/** Names: short, plain, no links or slurs. */
export function moderateName(raw: string): Verdict {
  const v = moderate(raw, { max: 40, required: false });
  if (!v.ok) return v;
  return { ok: true, text: v.text.replace(/\n/g, " ") };
}

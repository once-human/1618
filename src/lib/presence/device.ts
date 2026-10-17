import { createHmac } from "node:crypto";

/**
 * "Who is this person" for the live count: one code per device, so a private
 * window or a second browser on the same phone or laptop isn't counted as
 * someone else.
 *
 * Built from things every browser on one device shares: the network address
 * it comes from, the operating system, and the screen's real pixel size
 * (rotation and zoom don't change it). Scrambled with a secret and the date,
 * so it can't be turned back into any of those, changes every day, and is
 * never stored.
 *
 * The cost: two people on the same network with the same model of phone or
 * laptop look like one person.
 */

export const OSES = ["android", "ios", "mac", "windows", "chromeos", "linux", "other"] as const;
export type Os = (typeof OSES)[number];

/** Same household or phone on IPv6 = same /64; on IPv4, the address itself. */
export function networkOf(ip: string): string {
  const raw = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/%.*$/, "");
  const v4 = raw.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) return v4[1];
  if (!raw.includes(":")) return raw || "unknown";
  const [head, tail = ""] = raw.split("::");
  const left = head ? head.split(":") : [];
  const right = raw.includes("::") ? (tail ? tail.split(":") : []) : [];
  const groups = raw.includes("::")
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  return groups
    .slice(0, 4)
    .map((g) => (g || "0").replace(/^0+(?=.)/, ""))
    .join(":");
}

/** "390x844@3" style sizes become physical pixels, longest side first. */
export function screenOf(w: unknown, h: unknown): string | null {
  const a = Math.round(Number(w));
  const b = Math.round(Number(h));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 100 || b < 100 || a > 20000 || b > 20000)
    return null;
  return a >= b ? `${a}x${b}` : `${b}x${a}`;
}

export function deviceKey({
  ip,
  os,
  screen,
  day,
  secret,
}: {
  ip: string;
  os: Os;
  screen: string | null;
  day: string;
  secret: string;
}) {
  return createHmac("sha256", `${secret}|here|${day}`)
    .update(`${networkOf(ip)}|${os}|${screen ?? "?"}`)
    .digest("hex")
    .slice(0, 24);
}

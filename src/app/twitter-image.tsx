import { ogCard, OG_SIZE } from "@/lib/og";
import { profile } from "@/content/profile";

export const alt = "Onkar Yaglewad";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ word: "onkar", line: `${profile.tagline} This site is one ordinary day of mine, live.` });
}

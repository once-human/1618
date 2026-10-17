import { ogCard, OG_SIZE } from "@/lib/og";

export const alt = "now, Onkar Yaglewad";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ word: "now", line: "What I'm up to right now, mostly written by what I'm actually doing." });
}

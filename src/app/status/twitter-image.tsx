import { ogCard, OG_SIZE } from "@/lib/og";

export const alt = "status, Onkar Yaglewad";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ word: "status", line: "Everything this site does, and whether it's working right now." });
}

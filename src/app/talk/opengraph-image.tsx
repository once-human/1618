import { ogCard, OG_SIZE } from "@/lib/og";

export const alt = "talk, Onkar Yaglewad";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ word: "talk", line: "Write to me here. I answer right on the page." });
}

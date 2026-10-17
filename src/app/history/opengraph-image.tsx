import { ogCard, OG_SIZE } from "@/lib/og";

export const alt = "history, Onkar Yaglewad";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ word: "history", line: "Everything I've played, saved, built and run, kept and searchable." });
}

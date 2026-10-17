import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { profile } from "@/content/profile";

/**
 * The picture a shared link shows, in the site's own look: a rule, the
 * page's big word, and a line in my voice. Deliberately nothing live (apps
 * keep their copy of a preview for days, so anything live would be stale).
 */
export const OG_SIZE = { width: 1200, height: 630 };

export async function ogCard({ word, line, corner = profile.city }: { word: string; line: string; corner?: string }) {
  const [bold, regular] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/archivo-800.woff")),
    readFile(join(process.cwd(), "assets/fonts/archivo-400.woff")),
  ]);
  // The big word fills the width like it does on the site, smaller when it's long.
  const size = Math.min(330, Math.floor(1900 / Math.max(4, word.length)));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fff", color: "#000", padding: "40px 48px", fontFamily: "Archivo" }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #000", paddingTop: 10, fontSize: 26 }}>
          <span>{`${profile.name}, ${profile.role.toLowerCase()}`}</span>
          <span>{corner}</span>
        </div>
        <div style={{ display: "flex", fontSize: size, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 0.85, marginLeft: -8 }}>{word}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: "2px solid #000", paddingTop: 10, fontSize: 26, gap: 40 }}>
          <span style={{ display: "flex", maxWidth: 860, lineHeight: 1.25 }}>{line}</span>
          <span style={{ flexShrink: 0 }}>onkaryaglewad.in</span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Archivo", data: bold, weight: 800, style: "normal" },
        { name: "Archivo", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}

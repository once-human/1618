import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { cacheLife } from "next/cache";
import { getMusic } from "@/lib/presence/server";

/**
 * The picture a shared link shows: my name, big, and what I'm listening to
 * (or last listened to) when the preview was made. Apps that show link
 * previews keep their own copy for a while, so the song can lag.
 */
export const alt = "Onkar Yaglewad";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function nowLine(): Promise<string | null> {
  "use cache: remote";
  cacheLife({ stale: 120, revalidate: 300, expire: 3600 });
  const tracks = await getMusic().catch(() => null);
  const t = tracks?.[0];
  if (!t) return null;
  return t.nowPlaying ? `Listening to ${t.track} by ${t.artist}` : `Last played ${t.track} by ${t.artist}`;
}

export default async function Image() {
  const [bold, regular, line] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/archivo-800.woff")),
    readFile(join(process.cwd(), "assets/fonts/archivo-400.woff")),
    nowLine(),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fff", color: "#000", padding: "40px 48px", fontFamily: "Archivo" }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #000", paddingTop: 10, fontSize: 26 }}>
          <span>Onkar Yaglewad, product engineer</span>
          <span>Pune</span>
        </div>
        <div style={{ display: "flex", fontSize: 330, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 0.8, marginLeft: -10 }}>onkar</div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #000", paddingTop: 10, fontSize: 26 }}>
          <span style={{ maxWidth: 900, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{line ?? "One ordinary day, as a website"}</span>
          <span>onkaryaglewad.in</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Archivo", data: bold, weight: 800, style: "normal" },
        { name: "Archivo", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}

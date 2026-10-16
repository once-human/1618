import { connection } from "next/server";

export interface SongResult {
  id: number;
  track: string;
  artist: string;
  art: string | null;
  preview: string | null;
}

/** Search Apple Music for the "send me a song" box. */
export async function GET(req: Request) {
  await connection();
  const term = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (term.length < 2) return Response.json([] as SongResult[]);
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=6&country=in`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return Response.json([] as SongResult[], { status: 502 });
    const json = (await res.json()) as {
      results?: { trackId: number; trackName: string; artistName: string; artworkUrl100?: string; previewUrl?: string }[];
    };
    const out: SongResult[] = (json.results ?? []).map((r) => ({
      id: r.trackId,
      track: r.trackName,
      artist: r.artistName,
      art: r.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/96x96bb.jpg") ?? null,
      preview: r.previewUrl ?? null,
    }));
    return Response.json(out, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  } catch {
    return Response.json([] as SongResult[], { status: 502 });
  }
}

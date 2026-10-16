import { allow, q, visitorKey } from "@/lib/db";
import { moderate, moderateName } from "@/lib/moderation";

/**
 * Send me a song, or sign the guestbook. Posts go up straight away if they
 * pass the filter (I can hide anything later from /admin). A song is always
 * looked up again on Apple by its id, so nobody can slip in their own link
 * or picture.
 */
const say = (reason: string, status = 400) => Response.json({ ok: false, reason }, { status });

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return say("that didn't come through right. try again?");
  }
  // Bots fill every field; people never see this one.
  if (body.website) return Response.json({ ok: true });

  const kind = body.kind === "song" ? "song" : body.kind === "note" ? "note" : null;
  if (!kind) return say("send a song or a note");

  const name = moderateName(typeof body.name === "string" ? body.name : "");
  if (!name.ok) return say(name.reason);
  const message = moderate(typeof body.message === "string" ? body.message : "", {
    max: kind === "song" ? 140 : 280,
    required: kind === "note",
  });
  if (!message.ok) return say(message.reason);

  let song: { track: string; artist: string; art: string | null; link: string; preview: string | null } | null = null;
  if (kind === "song") {
    const id = Number(body.songId);
    if (!Number.isInteger(id) || id <= 0) return say("pick a song from the list first");
    try {
      const res = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=in`, { signal: AbortSignal.timeout(5000) });
      const r = ((await res.json()) as {
        results?: { trackName: string; artistName: string; artworkUrl100?: string; trackViewUrl?: string; previewUrl?: string }[];
      }).results?.[0];
      if (!r?.trackViewUrl) return say("couldn't find that song on Apple Music. try another?");
      song = {
        track: r.trackName,
        artist: r.artistName,
        art: r.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/96x96bb.jpg") ?? null,
        link: r.trackViewUrl.replace(/[?&]uo=\d+/, ""),
        preview: r.previewUrl ?? null,
      };
    } catch {
      return say("Apple Music isn't answering. try again in a sec?", 502);
    }
  }

  const who = visitorKey(req);
  if (!(await allow(`submit:${who}`, 3, 3600))) return say("slow down a little 🙂 try again in a bit", 429);

  // The same words twice in a day is copy-paste spam.
  if (message.text) {
    const dup = await q<{ n: number }>("dup check", (db) =>
      db`SELECT count(*)::int AS n FROM submissions WHERE lower(message) = lower(${message.text}) AND created_at > now() - interval '1 day'`,
    );
    if ((dup?.[0]?.n ?? 0) > 0) return say("someone already said exactly that 😄");
  }

  const rows = await q<{ id: number; created_at: string }>("submit", (db) =>
    db`INSERT INTO submissions (kind, name, message, payload, status)
       VALUES (${kind}, ${name.text || null}, ${message.text || null}, ${song ? JSON.stringify(song) : null}::jsonb, 'live')
       RETURNING id, created_at`,
  );
  if (!rows?.[0]) return say("something broke on my end. try again later?", 500);
  return Response.json({
    ok: true,
    submission: {
      id: rows[0].id,
      kind,
      name: name.text || null,
      message: message.text || null,
      song,
      at: new Date(rows[0].created_at).toISOString(),
    },
  });
}

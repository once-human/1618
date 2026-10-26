import "server-only";
import { getMusic, getPresence } from "@/lib/presence/server";
import { getSaved } from "@/lib/presence/pinterest";
import { getListeningStats } from "@/lib/presence/lastfm";
import { appleSong, appleSongById } from "@/lib/presence/server";
import { cachedSummary, roundToFive } from "@/lib/history/query";
import type { ListeningStats, Live } from "@/lib/presence/types";

/** Everything live in one go: presence, music, and Pinterest's version stamp. Served by /api/live and sent with pages. */
export async function getLive(): Promise<Live> {
  const [presence, tracks, saved] = await Promise.all([getPresence(), getMusic(), getSaved(4).catch(() => null)]);
  return {
    presence,
    music: { tracks, fetchedAt: new Date().toISOString() },
    savedVersion: saved?.fetchedAt ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

/** This month's listening, with the store's counts where it has them and Apple covers and links. */
export async function getListening(): Promise<ListeningStats | null> {
  const stats = await getListeningStats();
  if (!stats) return null;
  const to = roundToFive(new Date());
  const from = new Date(to.getTime() - 30 * 86400_000);
  const month = await cachedSummary(from.toISOString(), to.toISOString()).catch(() => null);
  if (month?.music.plays) {
    stats.onRepeat = month.music.topTracks.slice(0, 5).map((t) => ({ track: t.track, artist: t.artist, plays: t.plays }));
    stats.topArtists = month.music.topArtists.slice(0, 3);
  }
  const apple = await Promise.all(stats.onRepeat.map((t) => appleSong(t.artist, t.track, null, 7).catch(() => null)));
  // The history store already matched each song with its album, so its link is the right song: look that up by id
  // for the clip (a lookup by name alone, with no album, can land on a different song of the same name).
  const idOf = (u: string | null | undefined) => Number(u?.match(/[?&]i=(\d+)/)?.[1] ?? u?.match(/\/song\/[^/?]+\/(\d+)/)?.[1] ?? 0);
  const known = new Map((month?.music.topTracks ?? []).map((t) => [`${t.track}|${t.artist}`, t]));
  const exact = await Promise.all(stats.onRepeat.map((t) => (idOf(known.get(`${t.track}|${t.artist}`)?.url) ? appleSongById(idOf(known.get(`${t.track}|${t.artist}`)?.url)).catch(() => null) : null)));
  stats.onRepeat = stats.onRepeat.map((t, i) => {
    const mine = known.get(`${t.track}|${t.artist}`);
    const hit = exact[i] ?? apple[i];
    return {
      ...t,
      image: exact[i]?.art ?? mine?.image ?? apple[i]?.art ?? null,
      url: exact[i]?.link ?? mine?.url ?? apple[i]?.link ?? `https://music.apple.com/in/search?term=${encodeURIComponent(`${t.artist} ${t.track}`)}`,
      preview: hit?.preview ?? null,
    };
  });
  return stats;
}

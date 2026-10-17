import { connection } from "next/server";
import { getMusic, getPresence } from "@/lib/presence/server";
import { getSaved } from "@/lib/presence/pinterest";
import { getListeningStats } from "@/lib/presence/lastfm";
import { publicLinks, profile } from "@/content/profile";
import { SITE_URL } from "@/lib/site";
import { clockIn, fmtNum, timeAgo } from "@/lib/time";

/**
 * `curl -L onkaryaglewad.in`: the live site, as text, for terminals.
 * Terminal clients asking for / are sent here (see next.config.ts).
 * Add ?plain for no colour.
 */
export async function GET(req: Request) {
  await connection();
  const plain = new URL(req.url).searchParams.has("plain") || /Wget/i.test(req.headers.get("user-agent") ?? "");
  const b = (s: string) => (plain ? s : `\x1b[1m${s}\x1b[22m`);
  const d = (s: string) => (plain ? s : `\x1b[2m${s}\x1b[22m`);

  const [presence, tracks, saved, stats] = await Promise.all([
    getPresence(),
    getMusic().catch(() => null),
    getSaved(4).catch(() => null),
    getListeningStats().catch(() => null),
  ]);
  const now = Date.now();
  const place = presence.place;
  const playing = tracks?.find((t) => t.nowPlaying) ?? null;
  const last = tracks?.[0] ?? null;

  const row = (k: string, v: string | null | undefined) => (v ? `  ${d(k.padEnd(11))}${v}` : null);
  const lines = [
    "",
    `  ${b(profile.name.toUpperCase().split("").join(" "))}`,
    `  ${d(`${profile.role.toLowerCase()} · ${place.city} · ${clockIn(place.tz, new Date(now))} there`)}`,
    "",
    presence.status
      ? `  ● ${b(presence.status.text)} ${d(`(set ${timeAgo(presence.status.setAt, now)})`)}`
      : playing
        ? `  ● Awake, listening to ${b(playing.track)} by ${playing.artist}`
        : null,
    presence.status || playing ? "" : null,
    row("weather", presence.weather ? `${presence.weather.tempC}°, ${presence.weather.label.toLowerCase()} in ${place.city}` : null),
    row("music", playing ? `${playing.track} — ${playing.artist} ${d("(playing now)")}` : last ? `${last.track} — ${last.artist} ${d(`(${last.at ? timeAgo(last.at, now) : "recently"})`)}` : null),
    row("on repeat", stats?.onRepeat[0] ? `${stats.onRepeat[0].track} — ${stats.onRepeat[0].artist} ${d(`(${fmtNum(stats.onRepeat[0].plays)} plays this month)`)}` : null),
    row("building", presence.github ? `${presence.github.repo}${presence.github.message ? ` · "${presence.github.message}"` : ""} ${d(`(${timeAgo(presence.github.at, now)})`)}` : null),
    row("saved", saved?.pins[0] ? `a pin${saved.pins[0].board ? ` to ${saved.pins[0].board}` : ""} ${d(`(${saved.pins[0].at ? timeAgo(saved.pins[0].at, now) : "recently"})`)}` : null),
    row("steps", presence.health?.steps ? `${fmtNum(presence.health.steps)} today` : null),
    "",
    row("site", SITE_URL.replace("https://", "")),
    row("talk", `${SITE_URL.replace("https://", "")}/#talk ${d("(goes straight to my phone)")}`),
    ...publicLinks()
      .filter((l) => !l.href.startsWith("mailto:"))
      .map((l) => row(l.label.toLowerCase(), l.href.replace(/^https?:\/\/(www\.)?/, ""))),
    ...publicLinks()
      .filter((l) => l.href.startsWith("mailto:"))
      .map((l) => row("email", l.href.replace("mailto:", ""))),
    "",
    `  ${d("This updates live. Run it again in a bit.")}`,
    "",
  ].filter((l): l is string => l !== null);

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
  });
}

"use client";

import { useHere, useMusic, useNow, usePresence, useSaved } from "@/lib/presence/client";
import { clockIn, fmtNum, hourIn, timeAgo } from "@/lib/time";

type State = "active" | "around" | "away";

/**
 * One sentence that says where I am, built from everything live: a status I
 * set from my phone wins; otherwise what's playing, or the most recent thing
 * I did anywhere. Underneath: my time against yours, and who else is here.
 */
export function StatusLine({ className = "" }: { className?: string }) {
  const presence = usePresence();
  const music = useMusic();
  const saved = useSaved();
  const here = useHere();
  const now = useNow();
  if (!now || !presence) return <div className={`min-h-[5rem] ${className}`} aria-hidden />;

  const playing = music?.tracks?.find((t) => t.nowPlaying) ?? null;
  const signals = [
    music?.tracks?.[0]?.at ? { at: music.tracks[0].at, what: `played ${music.tracks[0].track}` } : null,
    presence.github ? { at: presence.github.at, what: `${presence.github.action.toLowerCase()} ${presence.github.repo}` } : null,
    saved?.pins[0]?.at ? { at: saved.pins[0].at, what: `saved a pin${saved.pins[0].board ? ` to ${saved.pins[0].board}` : ""}` } : null,
  ].filter((x): x is { at: string; what: string } => !!x);
  const latest = signals.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  const since = latest ? now - Date.parse(latest.at) : Infinity;
  const place = presence.place ?? { city: "Pune", tz: "Asia/Kolkata" };
  const mine = { label: clockIn(place.tz, new Date(now)), hour: hourIn(place.tz, new Date(now)) };

  let state: State;
  let line: React.ReactNode;
  if (playing) {
    state = "active";
    line = (
      <>
        Awake, listening to <span className="font-semibold">{playing.track}</span> by {playing.artist}.
      </>
    );
  } else if (since < 15 * 60_000 && latest) {
    state = "active";
    line = <>Around. Just {latest.what}.</>;
  } else if (since < 2 * 3600_000 && latest) {
    state = "around";
    line = <>Around. Last {latest.what}, {timeAgo(latest.at, now)}.</>;
  } else {
    state = "away";
    const asleep = mine.hour >= 1 && mine.hour < 8;
    line = latest ? (
      <>
        {asleep ? "Probably asleep" : "Away from the screen"}. Last seen {timeAgo(latest.at, now)}.
      </>
    ) : (
      <>{asleep ? "Probably asleep." : "Away from the screen."}</>
    );
  }

  const manual = presence.status;
  const visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sameZone =
    visitorZone === place.tz ||
    (["Asia/Kolkata", "Asia/Calcutta"].includes(visitorZone) && ["Asia/Kolkata", "Asia/Calcutta"].includes(place.tz));
  const theirs = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(now));
  const steps = presence.health?.steps;

  return (
    <div className={className} aria-live="polite">
      <p className="flex items-start gap-3 text-[clamp(1.25rem,2.6vw,2rem)] leading-tight tracking-tight">
        <Dot state={manual ? "active" : state} />
        <span>
          {manual ? (
            <>
              <span className="font-semibold">{manual.text}</span>
              <span className="text-quiet"> · set {timeAgo(manual.setAt, now)}</span>
            </>
          ) : (
            line
          )}
        </span>
      </p>
      <p className="tnum mt-3 text-quiet md:pl-[1.6rem]">
        {sameZone ? (
          <>
            It&apos;s {mine.label} here in {place.city}.
          </>
        ) : (
          <>
            It&apos;s {mine.label} in {place.city}, {theirs} where you are.
          </>
        )}
        {typeof steps === "number" && steps > 0 ? <> {fmtNum(steps)} steps today.</> : null}
        {here != null && here > 0 ? (
          <> {here > 1 ? `${here} people here right now, you included.` : "Just you here right now."}</>
        ) : null}
      </p>
    </div>
  );
}

function Dot({ state }: { state: State }) {
  return (
    <span aria-label={state} className="relative mt-[0.32em] inline-flex size-[0.55em] shrink-0">
      {state === "active" ? <span className="absolute inset-0 animate-ping rounded-full bg-ink opacity-30 motion-reduce:hidden" /> : null}
      <span
        className={`relative inline-block size-full rounded-full border-2 border-ink ${
          state === "active" ? "bg-ink" : state === "around" ? "bg-[linear-gradient(90deg,var(--ink)_50%,transparent_50%)]" : ""
        }`}
      />
    </span>
  );
}

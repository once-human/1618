"use client";

import { PlayDot } from "@/components/live/PlayDot";
import { useDesk, useHere, useMusic, useNow, usePresence, useSaved } from "@/lib/presence/client";
import { myTown, useOthers } from "@/lib/presence/here";
import { whoIsHere, type Town } from "@/lib/presence/words";
import { placeName } from "@/lib/geo";
import { clockIn, fmtNum, hourIn, timeAgo } from "@/lib/time";
import { bedClock, inBed } from "@/lib/presence/asleep";

type State = "active" | "around" | "away";

/**
 * One sentence that says where I am, built from everything live: going to
 * bed ("Hey Siri, good night") or a status I set from my phone wins, whichever
 * is newer; otherwise what's playing, or the most recent thing I did anywhere. Underneath: my time against yours, and who else is here.
 */
export function StatusLine({ className = "" }: { className?: string }) {
  const presence = usePresence();
  const music = useMusic();
  const saved = useSaved();
  const here = useHere();
  const others = useOthers();
  const desk = useDesk();
  const now = useNow();
  if (!now || !presence) return <div className={`min-h-[5rem] ${className}`} aria-hidden />;

  const playing = music?.tracks?.find((t) => t.nowPlaying) ?? null;
  const signals = [
    music?.tracks?.[0]?.at
      ? { at: music.tracks[0].at, what: `played ${music.tracks[0].track}` }
      : null,
    presence.github
      ? {
          at: presence.github.at,
          what: `${presence.github.action.toLowerCase()} ${presence.github.repo}`,
        }
      : null,
    desk?.lastActive ? { at: desk.lastActive, what: "used the laptop" } : null,
    saved?.pins[0]?.at
      ? {
          at: saved.pins[0].at,
          what: `saved a pin${saved.pins[0].board ? ` to ${saved.pins[0].board}` : ""}`,
        }
      : null,
  ].filter((x): x is { at: string; what: string } => !!x);
  const latest = signals.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  const since = latest ? now - Date.parse(latest.at) : Infinity;
  const place = presence.place ?? { city: "Pune", tz: "Asia/Kolkata" };
  const mine = { label: clockIn(place.tz, new Date(now)), hour: hourIn(place.tz, new Date(now)) };

  let state: State;
  let line: React.ReactNode;
  const d = desk?.online && desk.active ? desk : null;
  if (d?.doing) {
    state = "active";
    line = (
      <>
        <span className="font-semibold">{d.doing.label}</span>
        {d.doing.detail ? <> · {d.doing.detail}</> : null}.
        {d.playing ? (
          <>
            {" "}
            {playing ? "Listening to" : "Playing:"} <span className="font-semibold">{playing ? playing.track : d.playing.label}</span>
            {d.playing.detail && !playing ? <> · {d.playing.detail}</> : null}.
          </>
        ) : null}
      </>
    );
  } else if (playing) {
    state = "active";
    line = (
      <>
        Awake, listening to <span className="font-semibold">{playing.track}</span> by{" "}
        {playing.artist}. <PlayDot id={`now-${playing.track}`} url={playing.preview} label={`${playing.track} by ${playing.artist}`} />
      </>
    );
  } else if (since < 15 * 60_000 && latest) {
    state = "active";
    line = <>Around. Just {latest.what}.</>;
  } else if (since < 2 * 3600_000 && latest) {
    state = "around";
    line = (
      <>
        Around. Last {latest.what}, {timeAgo(latest.at, now)}.
      </>
    );
  } else {
    state = "away";
    // Quiet on every screen between 23:00 and 10:00 means asleep: "probably" from 45 minutes of nothing, plainly after two hours.
    const night = mine.hour >= 23 || mine.hour < 10;
    line =
      night && latest && since >= 45 * 60_000 ? (
        <>
          {since < 2 * 3600_000 ? "Probably slept" : "Slept"} {timeAgo(latest.at, now)}.
        </>
      ) : latest ? (
        <>Away from the screen. Last seen {timeAgo(latest.at, now)}.</>
      ) : (
        <>{night ? "Probably asleep." : "Away from the screen."}</>
      );
  }

  const bed = inBed(presence, now, saved?.pins[0]?.at, { musicAt: music?.tracks?.[0]?.at, deskAt: desk?.online && desk.active ? desk.lastSeen : null });
  const manual = bed ? null : presence.status;
  const visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sameZone =
    visitorZone === place.tz ||
    (["Asia/Kolkata", "Asia/Calcutta"].includes(visitorZone) &&
      ["Asia/Kolkata", "Asia/Calcutta"].includes(place.tz));
  const theirs = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(now));
  const steps = presence.health?.steps;

  return (
    <div className={className} aria-live="polite">
      <p className="flex items-start gap-3 text-[clamp(1.25rem,2.6vw,2rem)] leading-tight tracking-tight">
        <Dot state={bed ? "away" : manual ? "active" : state} />
        <span>
          {bed ? (
            <>
              Went to bed at <span className="font-semibold">{bedClock(bed, place.tz)}</span>
              {playing ? (
                <>
                  , falling asleep to <span className="font-semibold">{playing.track}</span>
                </>
              ) : null}
              .<span className="text-quiet"> · {timeAgo(bed.at, now)}</span>
            </>
          ) : manual ? (
            <>
              <span className="font-semibold">{manual.text}</span>
              <span className="text-quiet"> · set {timeAgo(manual.setAt, now)}</span>
            </>
          ) : (
            line
          )}
        </span>
      </p>
      <p className="tnum text-quiet mt-3 md:pl-[1.6rem]">
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
        {here && here.people > 0 ? <> {hereLine(here, others)}</> : null}
      </p>
    </div>
  );
}

/** "Just you here right now." / "Here right now: you, two people in Berlin and someone in Mumbai." */
export function hereLine({ people, mine }: { people: number; mine: number }, others: Town[]) {
  const me = myTown();
  // A town in my own country needs no country name.
  const name = (t: Town) => (t.city && me.country && t.country === me.country ? t.city : placeName(t.city, t.country));
  return whoIsHere(others, me, name, { people, myTabs: mine });
}

function Dot({ state }: { state: State }) {
  return (
    <span role="img" aria-label={state === "active" ? "Active" : state === "around" ? "Around" : "Away"} className="relative mt-[0.32em] inline-flex size-[0.55em] shrink-0">
      {state === "active" ? (
        <span className="bg-ink absolute inset-0 animate-ping rounded-full opacity-30 motion-reduce:hidden" />
      ) : null}
      <span
        className={`border-ink relative inline-block size-full rounded-full border-2 ${
          state === "active"
            ? "bg-ink"
            : state === "around"
              ? "bg-[linear-gradient(90deg,var(--ink)_50%,transparent_50%)]"
              : ""
        }`}
      />
    </span>
  );
}

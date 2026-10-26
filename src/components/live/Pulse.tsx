"use client";

import { PlayDot } from "@/components/live/PlayDot";
import { useDesk, useHere, useSleepInputs, useMusic, useNow, usePresence, useSaved } from "@/lib/presence/client";
import { myTown, useOthers } from "@/lib/presence/here";
import { whoIsHere, type Town } from "@/lib/presence/words";
import { placeName } from "@/lib/geo";
import { clockIn, fmtNum, hourIn, timeAgo } from "@/lib/time";
import { bedClock, inBed } from "@/lib/presence/asleep";
import { bursts, sleepNow } from "@/lib/presence/sleep";
import { allnighterLine, bedLine, doingLine, lateLine, musicLine, noSleepTail, pick, quietLine, wokeLine } from "@/lib/presence/voice";

type State = "active" | "around" | "away";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A line from voice.ts, with its **bold** bits. */
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) => (i % 2 ? <span key={i} className="font-semibold">{part}</span> : part))}
    </>
  );
}

/**
 * The Pulse: one sentence that says where I am, built from everything live: going to
 * bed ("Hey Siri, good night") or a status I set from my phone wins, whichever
 * is newer; otherwise what's playing, or the most recent thing I did anywhere. Underneath: my time against yours, and who else is here.
 */
export function Pulse({ className = "" }: { className?: string }) {
  const presence = usePresence();
  const music = useMusic();
  const saved = useSaved();
  const here = useHere();
  const others = useOthers();
  const desk = useDesk();
  const sleepIn = useSleepInputs();
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

  // Live signals join the database's history, so the guess is never behind what's on screen.
  const guess = sleepIn
    ? sleepNow({
        now,
        tz: place.tz,
        bursts: bursts([
          ...sleepIn.bursts.flat(),
          ...signals.map((s) => Date.parse(s.at)),
          ...(playing || (desk?.online && desk.active) ? [now] : []),
          ...(presence.status ? [Date.parse(presence.status.setAt)] : []),
        ]),
        past: sleepIn.past,
      })
    : null;
  const place2 = place;
  const clock = (ms: number) => clockIn(place2.tz, new Date(ms));
  const bucket = Math.floor(now / (25 * 60_000));
  const seed = (k: string) => `${k}|${bucket}`;
  const bed = inBed(presence, now, saved?.pins[0]?.at, { musicAt: music?.tracks?.[0]?.at, deskAt: desk?.online && desk.active ? desk.lastSeen : null });
  const manual = bed ? null : presence.status;

  // Up very late, or through the night: said first, before whatever I'm doing.
  const prefix = guess?.state === "allnighter" ? allnighterLine(mine.label, seed("an")) + " " : guess?.state === "late" ? lateLine(mine.label, seed("late")) + " " : "";
  const tired = guess?.noSleep && guess.state === "awake" ? noSleepTail(seed("ns")) : "";
  const d = desk?.online && desk.active ? desk : null;
  // A track from a real music player on the laptop (never YouTube), when Last.fm hasn't caught it.
  const deskTrack = d?.playing && d.playing.label !== "Watching YouTube" && d.playing.detail ? { track: d.playing.label, artist: d.playing.detail } : null;

  let state: State;
  let text: string;
  let clip: React.ReactNode = null;
  if (d?.doing) {
    state = "active";
    const forMs = d.doingSince ? now - Date.parse(d.doingSince) : 0;
    const song = playing ? { track: playing.track, artist: playing.artist } : deskTrack;
    text = prefix + doingLine(d.doing, forMs, seed(`do|${d.doing.label}`)) + (song ? " " + musicLine(song.track, song.artist, seed("m"), false) : "") + tired;
  } else if (playing) {
    state = "active";
    text = prefix + musicLine(playing.track, playing.artist, seed(`m|${playing.track}`), true) + tired;
  } else if (since < 15 * 60_000 && latest) {
    state = "active";
    text = prefix + pick([`Around. Just ${latest.what}.`, `Just ${latest.what}.`, `Here. Just ${latest.what}.`], seed("around")) + tired;
  } else if (since < 45 * 60_000 && latest) {
    state = "around";
    text = pick([`Around. Last ${latest.what}, ${timeAgo(latest.at, now)}.`, `Was just here. ${cap(latest.what)}, ${timeAgo(latest.at, now)}.`], seed("around2"));
  } else if (guess && guess.since && guess.state !== "awake" && guess.state !== "late" && guess.state !== "allnighter") {
    state = "away";
    text = quietLine(guess.state, clock(guess.since), now - guess.since, seed("q"));
  } else {
    state = "away";
    text = latest ? `Away from the screen. Last seen ${timeAgo(latest.at, now)}.` : "Away from the screen.";
  }
  if (playing) clip = <PlayDot id={`now-${playing.track}`} url={playing.preview} label={`${playing.track} by ${playing.artist}`} />;

  const line = bed ? (
    <>
      <Words text={bedLine(bedClock(bed, place.tz), seed("bed")).replace(/\.$/, "")} />
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
    <>
      <Words text={text} /> {clip}
    </>
  );
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
        <span>{line}</span>
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
        {!bed && guess?.woke ? <> {wokeLine(clock(guess.woke.at), guess.woke.hours, seed("woke"))}</> : null}
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

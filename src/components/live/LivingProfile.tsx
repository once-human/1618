"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence, useNow } from "@/lib/presence/client";
import { dayPhase, phaseColor, puneNow, timeAgo, within } from "@/lib/time";
import { ALWAYS } from "@/content/always";
import { profile, publicLinks } from "@/content/profile";

function Dot({ live }: { live: boolean }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {live && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 motion-reduce:animate-none" />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-white/25"}`} />
    </span>
  );
}

/** Avatar with a slowly turning ring tinted by the real light in Pune. */
function Avatar({ hour, size = 64 }: { hour: number; size?: number }) {
  const [a, b] = phaseColor(hour);
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <span
        aria-hidden
        className="absolute inset-0 animate-[spin_9s_linear_infinite] rounded-full motion-reduce:animate-none"
        style={{ background: `conic-gradient(from 0deg, ${a}, ${b}, ${a})` }}
      />
      <span
        className="relative grid place-items-center rounded-full bg-[#121110] font-mono font-medium tracking-tight text-white"
        style={{ width: size - 6, height: size - 6, fontSize: size * 0.3 }}
      >
        OY
      </span>
    </span>
  );
}

/**
 * Bump-inspired status bubble (bottom-left) that opens a living profile:
 * what's actually happening right now, plus the things that are always true.
 */
export function LivingProfile() {
  const presence = usePresence();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [knocked, setKnocked] = useState(false);
  const [tick, setTick] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  // Rotate through the live signals in the bubble.
  useEffect(() => {
    if (open) return;
    const id = setInterval(() => setTick((t) => t + 1), 4500);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!now) return null;

  const pune = puneNow(new Date(now));
  const phase = dayPhase(pune.hour);
  const gh = presence?.github;
  const music = presence?.music;
  const weather = presence?.weather;
  const ghHot = gh ? within(gh.at, 24, now) : false;

  const bubbles: string[] = [`${pune.label} in Pune · ${phase}`];
  if (gh) bubbles.push(`${gh.action} ${gh.repo} · ${timeAgo(gh.at, now)}`);
  if (music) bubbles.push(music.nowPlaying ? `♪ ${music.track}` : `♪ last played ${timeAgo(music.at ?? "", now)}`);
  if (weather) bubbles.push(`${weather.tempC}° in Pune${weather.label ? `, ${weather.label}` : ""}`);
  const bubble = bubbles[tick % bubbles.length];

  const links = publicLinks();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="living-profile"
        className="fixed bottom-4 left-4 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-white/12 bg-black/55 py-1.5 pr-4 pl-1.5 text-left shadow-[0_10px_40px_-10px_rgba(0,0,0,.8)] backdrop-blur-xl transition-colors hover:border-white/30 sm:bottom-6 sm:left-6"
      >
        <Avatar hour={pune.hour} size={30} />
        <span className="flex min-w-0 items-center gap-2">
          <Dot live={ghHot || !!music?.nowPlaying} />
          <span key={bubble} className="animate-[fadein_.5s_ease] truncate font-mono text-[11px] text-white/80">
            {bubble}
          </span>
        </span>
        <span className="sr-only">Open Onkar&apos;s living profile</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[59]" onClick={() => setOpen(false)} aria-hidden />
      )}

      <div
        id="living-profile"
        ref={panel}
        role="dialog"
        aria-label="Living profile"
        tabIndex={-1}
        hidden={!open}
        className="fixed bottom-20 left-4 z-[60] w-[min(calc(100vw-2rem),380px)] origin-bottom-left animate-[pop_.35s_cubic-bezier(.2,.9,.3,1.2)] rounded-[28px] border border-white/12 bg-[#0f0e0d]/90 p-5 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,.9)] outline-none backdrop-blur-2xl sm:bottom-[5.5rem] sm:left-6"
      >
        <div className="flex items-center gap-4">
          <Avatar hour={pune.hour} />
          <div className="min-w-0">
            <p className="text-lg font-medium tracking-tight">{profile.name}</p>
            <p className="text-sm text-white/55">
              {profile.role} · {profile.city}
            </p>
          </div>
        </div>

        <p className="mt-4 rounded-2xl bg-white/[0.06] px-4 py-3 text-sm leading-relaxed text-white/80">
          It&apos;s <span className="font-mono text-white">{pune.label}</span> in Pune, {phase}
          {weather && (
            <>
              {" "}· {weather.tempC}°{weather.label ? ` and ${weather.label}` : ""}
            </>
          )}
          .
        </p>

        <h3 className="mt-5 mb-2 font-mono text-[10px] tracking-[0.2em] text-emerald-300/80 uppercase">Live</h3>
        <ul className="space-y-2.5 text-sm">
          {gh ? (
            <li className="flex gap-3">
              <span className="mt-1.5">
                <Dot live={ghHot} />
              </span>
              <div className="min-w-0">
                <p>
                  <span className="text-white/55">{gh.action} </span>
                  <a href={gh.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                    {gh.repo}
                  </a>
                  <span className="text-white/45"> · {timeAgo(gh.at, now)}</span>
                </p>
                {gh.message && <p className="truncate font-mono text-xs text-white/45">“{gh.message}”</p>}
              </div>
            </li>
          ) : (
            <li className="text-white/40">Loading what I&apos;m building…</li>
          )}
          {music && (
            <li className="flex gap-3">
              <span className="mt-1.5">
                <Dot live={music.nowPlaying} />
              </span>
              <p className="min-w-0">
                <span className="text-white/55">{music.nowPlaying ? "Listening to " : "Last played "}</span>
                <a href={music.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                  {music.track}
                </a>
                <span className="text-white/55"> by {music.artist}</span>
                {!music.nowPlaying && music.at && <span className="text-white/45"> · {timeAgo(music.at, now)}</span>}
              </p>
            </li>
          )}
        </ul>

        <h3 className="mt-5 mb-2 font-mono text-[10px] tracking-[0.2em] text-white/40 uppercase">Always</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {ALWAYS.filter((r) => !("hideWhenLive" in r && r.hideWhenLive === "music" && music)).map((r) => (
            <div key={r.key} className="contents">
              <dt className="text-white/40">{r.key}</dt>
              <dd className="text-white/80">{r.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          {!knocked ? (
            <button
              type="button"
              onClick={() => setKnocked(true)}
              className="w-full rounded-full bg-white py-2.5 text-sm font-medium text-black transition-transform active:scale-[.97]"
            >
              Knock 👋
            </button>
          ) : (
            <div className="animate-[fadein_.4s_ease] rounded-2xl bg-white/[0.06] p-4 text-center text-sm">
              <p className="text-white/80">Door&apos;s open. Find me here:</p>
              <ul className="mt-2 flex flex-wrap justify-center gap-3 font-mono text-xs">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-200/90 hover:underline">
                      {label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

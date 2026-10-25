"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { resetTracking, setTracking, trackingOff, visitorCode } from "@/lib/visits/client";
import type { EventRow, VisitRow } from "@/lib/visits/shared";
import { placeName } from "@/lib/geo";

type Mine = (VisitRow & { events: EventRow[] })[];

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const secs = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);
const btn = "border border-ink px-3 py-1.5 text-[14px] hover:bg-ink hover:text-paper disabled:opacity-40";

// Reads the browser's own settings; nothing to render on the server.
const subscribe = (f: () => void) => (window.addEventListener("storage", f), () => window.removeEventListener("storage", f));

/**
 * "Your visit" on /privacy: exactly what the visitor log holds about this
 * browser, with a way to delete it and to turn the log off.
 */
export function YourVisit() {
  const [version, setVersion] = useState(0);
  const off = useSyncExternalStore(subscribe, () => trackingOff(), () => null);
  const code = useSyncExternalStore(subscribe, () => visitorCode(false), () => null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let live = true;
    fetch(`/api/track?me=${code}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { visits: [] }))
      .then((d: { visits: Mine }) => live && setMine(d.visits))
      .catch(() => live && setMine([]));
    return () => {
      live = false;
    };
  }, [code, version]);

  async function forget(andStop: boolean) {
    setBusy(true);
    // Stop first, so nothing in flight recreates what's being deleted.
    const gone = code;
    if (andStop) setTracking(false);
    else resetTracking();
    if (gone) await fetch(`/api/track?me=${gone}`, { method: "DELETE" }).catch(() => null);
    setMine([]);
    setNote(andStop ? "Deleted, and the log is off for this browser." : "Deleted. Your next page starts afresh, under a new code.");
    setBusy(false);
    window.dispatchEvent(new StorageEvent("storage"));
    setVersion((v) => v + 1);
  }

  if (off === null) return <p className="text-quiet">Checking your browser…</p>;

  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { globalPrivacyControl?: boolean }) : null;
  const asked = nav?.globalPrivacyControl === true || nav?.doNotTrack === "1";

  return (
    <div className="space-y-4">
      {off ? (
        <>
          <p>
            <span className="font-semibold">The log is off for this browser.</span>{" "}
            {asked
              ? "Your browser asks sites not to track it (Global Privacy Control or Do Not Track), so the log leaves you out."
              : "You turned it off here. Nothing about your visits is being kept."}
          </p>
          {!asked ? (
            <button
              type="button"
              className={btn}
              onClick={() => {
                setTracking(true);
                window.dispatchEvent(new StorageEvent("storage"));
                setNote("On again, from your next page.");
              }}
            >
              Turn it back on
            </button>
          ) : null}
        </>
      ) : (
        <>
          <p>
            Your browser&apos;s code is{" "}
            <code className="bg-ink/[0.06] px-1">{code ? `${code.slice(0, 6)}…${code.slice(-4)}` : "not made yet"}</code>. This is
            everything the log holds for it right now:
          </p>
          {mine === null ? (
            <p className="text-quiet">Loading…</p>
          ) : !mine.length ? (
            <p className="text-quiet">Nothing yet. It starts once you move, scroll or tap.</p>
          ) : (
            <ol className="space-y-5">
              {mine.map((v) => (
                <li key={v.id} className="border-ink/20 border-t pt-2">
                  <p className="font-semibold">
                    {time(v.startedAt)}
                    <span className="text-quiet font-normal">
                      {" "}
                      · {v.city || v.country ? placeName(v.city, v.country) : "town unknown"} · {v.device ?? "device unknown"}
                      {v.screen ? ` (${v.screen})` : ""}
                      {v.referrer ? ` · from ${v.referrer}` : ""}
                      {v.lang ? ` · ${v.lang}` : ""}
                    </span>
                  </p>
                  <ul className="mt-1 text-[14px]">
                    {v.events.map((e) => (
                      <li key={e.seq} className="tnum grid grid-cols-[3.4rem_1fr] gap-x-2">
                        <span className="text-quiet">{new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span>
                        <span className="min-w-0 truncate">
                          {e.type === "page" ? `opened ${e.path}` : e.type === "click" ? `followed a link to ${e.detail}` : e.detail}
                          {e.type === "page" && e.ms ? <span className="text-quiet"> · {secs(e.ms)}{e.scroll != null ? `, ${e.scroll}% down` : ""}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" className={btn} disabled={busy} onClick={() => void forget(false)}>
              Delete all of it
            </button>
            <button type="button" className={btn} disabled={busy} onClick={() => void forget(true)}>
              Delete it and stop logging me
            </button>
          </div>
        </>
      )}
      {note ? (
        <p role="status" className="text-quiet">
          {note}
        </p>
      ) : null}
    </div>
  );
}

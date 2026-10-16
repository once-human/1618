"use client";

import { useEffect, useRef, useState } from "react";
import { addSubmission, useNow, useSongsSent } from "@/lib/presence/client";
import { timeAgo } from "@/lib/time";
import { Label } from "@/components/site/Label";
import { Preview } from "@/components/live/Preview";
import { Cover } from "@/components/live/Cover";
import type { SongResult } from "@/app/api/songs/search/route";

const field = "w-full border-b border-ink bg-transparent py-1.5 outline-none placeholder:text-quiet focus:border-b-2";

/**
 * Send me a song: search Apple Music, pick one, add your name and a line if
 * you like. It shows up in "sent to me" straight away.
 */
export function SendSong() {
  const sent = useSongsSent();
  const now = useNow();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongResult[]>([]);
  const [picked, setPicked] = useState<SongResult | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "done" | "error"; text?: string }>({ kind: "idle" });
  const trap = useRef<HTMLInputElement>(null);

  // Search as you type, a beat after you stop.
  useEffect(() => {
    if (picked || query.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/songs/search?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: SongResult[]) => setResults(d))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, picked]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "song", songId: picked.id, name, message: note, website: trap.current?.value }),
      });
      const d = await res.json();
      if (!d.ok) return setState({ kind: "error", text: d.reason });
      if (d.submission) addSubmission(d.submission);
      setState({ kind: "done", text: "got it, thank you 🖤 I'll give it a proper listen" });
      setPicked(null);
      setQuery("");
      setNote("");
      setResults([]);
    } catch {
      setState({ kind: "error", text: "that didn't go through. try again?" });
    }
  }

  return (
    <div id="send-a-song">
      <Label note="I listen to all of them">Send me a song</Label>
      <form onSubmit={send} className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-4">
        <div className="md:col-span-2">
          {picked ? (
            <div className="flex items-center gap-3 border-b border-ink py-1.5">
              <Preview id={`pick|${picked.id}`} url={picked.preview} image={picked.art} label={picked.track} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{picked.track}</span>
                <span className="block truncate text-quiet">{picked.artist}</span>
              </span>
              <button type="button" onClick={() => setPicked(null)} className="text-quiet hover:text-ink">
                change
              </button>
            </div>
          ) : (
            <>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value.trim().length < 2) setResults([]);
                }}
                placeholder="Search for a song"
                aria-label="Search for a song"
                className={field}
              />
              {results.length > 0 && (
                <ul className="mt-1">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPicked(r);
                          setResults([]);
                          setState({ kind: "idle" });
                        }}
                        className="flex w-full items-center gap-3 border-b border-ink/15 py-1.5 text-left hover:bg-ink/5"
                      >
                        <Cover url={r.art} px={32} />
                        <span className="min-w-0 truncate">
                          {r.track} <span className="text-quiet">{r.artist}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" maxLength={40} aria-label="Your name" className={field} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this one? (optional)" maxLength={140} aria-label="A line about it" className={field} />
        {/* Hidden from people; bots fill it in. */}
        <input ref={trap} name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        <div className="flex items-baseline gap-4 md:col-span-4">
          <button
            type="submit"
            disabled={!picked || state.kind === "sending"}
            className="border-t border-ink pt-1.5 font-semibold disabled:text-quiet"
          >
            {state.kind === "sending" ? "Sending…" : "Send it"}
          </button>
          {state.text ? <p className={state.kind === "error" ? "text-ink" : "text-quiet"} role="status">{state.text}</p> : null}
        </div>
      </form>

      {sent && sent.length > 0 && (
        <>
          <p className="mt-10 mb-2 border-t border-ink pt-1.5 font-semibold">Sent to me</p>
          <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
            {sent.slice(0, 12).map((s) =>
              s.song ? (
                <li key={s.id} className="flex items-start gap-3 border-b border-ink/15 py-2.5">
                  <Preview id={`sent|${s.id}`} url={s.song.preview} image={s.song.art} label={s.song.track} size={40} />
                  <span className="min-w-0 text-[14px] leading-snug">
                    <a href={s.song.link} target="_blank" rel="noopener noreferrer" className="block truncate font-semibold hover:underline">
                      {s.song.track}
                    </a>
                    <span className="block truncate text-quiet">{s.song.artist}</span>
                    {s.message ? <span className="mt-1 block">“{s.message}”</span> : null}
                    <span className="mt-1 block text-[12px] text-quiet">
                      from {s.name || "someone"}
                      {now ? `, ${timeAgo(s.at, now)}` : ""}
                    </span>
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        </>
      )}
    </div>
  );
}

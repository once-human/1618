"use client";

import { useRef, useState } from "react";
import { addSubmission, useGuestbook, useNow, useVisits } from "@/lib/presence/client";
import { fmtNum, timeAgo } from "@/lib/time";

const field = "w-full border-b border-ink bg-transparent py-1.5 outline-none placeholder:text-quiet focus:border-b-2";

/** Sign the guestbook: a line, and a name if you want. Goes up straight away. */
export function Guestbook() {
  const notes = useGuestbook();
  const visits = useVisits();
  const now = useNow();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "done" | "error"; text?: string }>({ kind: "idle" });
  const trap = useRef<HTMLInputElement>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "note", name, message, website: trap.current?.value }),
      });
      const d = await res.json();
      if (!d.ok) return setState({ kind: "error", text: d.reason });
      if (d.submission) addSubmission(d.submission);
      setMessage("");
      setState({ kind: "done", text: "you're in the book. thank you 🖤" });
    } catch {
      setState({ kind: "error", text: "that didn't go through. try again?" });
    }
  }

  return (
    <div id="guestbook" className="mt-20">
      <div className="mb-6 flex items-baseline justify-between gap-4 border-t border-ink pt-1.5">
        <h3 className="font-semibold">Guestbook</h3>
        {visits ? <span className="tnum text-quiet">{fmtNum(visits)} visits so far</span> : null}
      </div>
      <form onSubmit={send} className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-4">
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Leave a line" maxLength={280} aria-label="Your message" className={`${field} md:col-span-2`} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" maxLength={40} aria-label="Your name" className={field} />
        <input ref={trap} name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        <div className="flex items-baseline gap-4">
          <button type="submit" disabled={!message.trim() || state.kind === "sending"} className="border-t border-ink pt-1.5 font-semibold disabled:text-quiet">
            {state.kind === "sending" ? "Signing…" : "Sign"}
          </button>
        </div>
        {state.text ? (
          <p className="text-quiet md:col-span-4" role="status">
            {state.text}
          </p>
        ) : null}
      </form>

      {notes && notes.length > 0 && (
        <ul className="mt-8 columns-1 gap-8 md:columns-2 lg:columns-3">
          {notes.map((n) => (
            <li key={n.id} className="mb-5 break-inside-avoid border-t border-ink/20 pt-2">
              <p className="text-[17px] leading-snug">{n.message}</p>
              <p className="mt-1 text-[12px] text-quiet">
                {n.name || "someone"}
                {now ? `, ${timeAgo(n.at, now)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

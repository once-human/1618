"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markRead, sendTalk, useTalk } from "@/lib/talk/client";
import { useNow, usePresence } from "@/lib/presence/client";
import { clockIn, timeAgo } from "@/lib/time";

const field = "w-full border-b border-ink bg-transparent py-1.5 outline-none placeholder:text-quiet focus:border-b-2";

/**
 * Talk to me, live. What you write lands on my phone; when I reply, it shows
 * up here while you're still on the page. Only shown when the line is open.
 */
export function Talk() {
  const talk = useTalk();
  const presence = usePresence();
  const now = useNow();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error" | "note"; text?: string }>({ kind: "idle" });
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);

  // While the conversation is on screen, replies count as read.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => markRead(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => {
      io.disconnect();
      markRead(false);
    };
  }, [talk.available]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [talk.messages.length]);

  if (!talk.available) return null;

  const place = presence?.place ?? { city: "Pune", tz: "Asia/Kolkata" };
  const clock = now ? clockIn(place.tz, new Date(now)) : null;
  const started = talk.messages.length > 0;

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || state.kind === "sending") return;
    setState({ kind: "sending" });
    const r = await sendTalk(text, name);
    if (!r.ok) return setState({ kind: "error", text: r.reason });
    setText("");
    setState(
      r.delivered
        ? { kind: "idle" }
        : { kind: "note", text: "saved, but my phone didn't get it just now. I'll see it soon." },
    );
  }

  return (
    <div id="talk" ref={box} className="mt-20 scroll-mt-24">
      <div className="border-ink mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-1.5">
        <h3 className="flex items-center gap-2 font-semibold">
          <span className="relative inline-flex size-2">
            <span className="bg-ink absolute inset-0 animate-ping rounded-full opacity-30 motion-reduce:hidden" />
            <span className="bg-ink relative size-2 rounded-full" />
          </span>
          Talk to me, live
        </h3>
        <span className="text-quiet">
          It goes to my phone, and my reply shows up right here.
          {clock ? ` It's ${clock} in ${place.city}.` : ""}
        </span>
      </div>

      {started ? (
        <ol ref={list} className="mb-6 max-h-[50vh] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {talk.messages.map((m) => (
            <li key={m.id} className={m.side === "me" ? "max-w-[46ch]" : "ml-auto max-w-[46ch] text-right"}>
              <p className={`text-[17px] leading-snug whitespace-pre-wrap ${m.side === "me" ? "" : "text-quiet"}`}>
                {m.text}
              </p>
              <p className="text-quiet mt-0.5 text-[12px]">
                {m.side === "me" ? "Onkar" : "you"}
                {now ? `, ${timeAgo(m.at, now)}` : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-6 max-w-[52ch] text-[17px] leading-snug">
          Say hi, ask something, pitch me an idea. If I&apos;m awake, I&apos;ll answer while you&apos;re still here.
        </p>
      )}

      <form onSubmit={send} className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder={started ? "Write back" : "Write to me"}
          aria-label="Your message"
          className={`${field} resize-none ${started ? "md:col-span-3" : "md:col-span-2"}`}
        />
        {!started ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            maxLength={40}
            aria-label="Your name"
            className={field}
          />
        ) : null}
        <div className="flex items-baseline">
          <button
            type="submit"
            disabled={!text.trim() || state.kind === "sending"}
            className="border-ink disabled:text-quiet border-t pt-1.5 font-semibold"
          >
            {state.kind === "sending" ? "Sending…" : "Send"}
          </button>
        </div>
        {state.text ? (
          <p className="text-quiet md:col-span-4" role="status">
            {state.text}
          </p>
        ) : null}
      </form>
      <p className="text-quiet mt-3 text-[12px]">
        Only I see these.{" "}
        <Link href="/privacy" className="hover:text-ink underline decoration-1 underline-offset-4">
          How it works
        </Link>
      </p>
    </div>
  );
}

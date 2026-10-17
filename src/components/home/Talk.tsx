"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markRead, sendTalk, useTalk } from "@/lib/talk/client";
import { useNow, usePresence } from "@/lib/presence/client";
import { clockIn, timeAgo } from "@/lib/time";

const field = "w-full border-b border-ink bg-transparent py-1.5 outline-none placeholder:text-quiet focus:border-b-2";

/**
 * Talk to me. What you write lands on my phone (when Telegram is hooked up)
 * and my reply shows up here while you're still on the page; otherwise it
 * waits for me, and the reply shows up the next time you're on the site.
 * Always open, here and on /talk.
 */
export function Talk({ page = false }: { page?: boolean }) {
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
  }, []);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [talk.messages.length]);

  const place = presence?.place ?? { city: "Pune", tz: "Asia/Kolkata" };
  const clock = now ? clockIn(place.tz, new Date(now)) : null;
  const started = talk.messages.length > 0;
  const live = talk.live === true;

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
        : r.live
          ? { kind: "note", text: "Saved, but my phone didn't get it just now. I'll see it soon." }
          : { kind: "note", text: "Sent. I'll answer right here. If you've left by then, you'll see it the next time you open the site." },
    );
  }

  return (
    <div id={page ? undefined : "talk"} ref={box} className={page ? "" : "mt-20 scroll-mt-24"}>
      <div className="border-ink mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-1.5">
        <h3 className="flex items-center gap-2 font-semibold">
          <span className="relative inline-flex size-2">
            {live ? <span className="bg-ink absolute inset-0 animate-ping rounded-full opacity-30 motion-reduce:hidden" /> : null}
            <span className={`relative size-2 rounded-full ${live ? "bg-ink" : "border-ink border"}`} />
          </span>
          {live ? "Talk to me, live" : "Talk to me"}
        </h3>
        <span className="text-quiet">
          {live
            ? "It goes straight to my phone, and my reply shows up right here."
            : "I read these and reply right here. If you've left by then, my reply waits for you on any page of the site."}
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
          Say hi, ask something, pitch me an idea.{" "}
          {live ? "If I'm awake, I'll answer while you're still here." : "No email or sign-up needed: this browser keeps the conversation."}
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

"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { adopt, changeName, markRead, remove, send, setName, useTalk, type Chat, type TalkMessage } from "@/lib/talk/client";
import { useMusic, useNow, usePresence } from "@/lib/presence/client";
import { clockIn, hourIn } from "@/lib/time";
import { Rich } from "@/components/talk/Rich";

const MAX = 2000;
const field = "w-full border-b border-ink bg-transparent py-1.5 outline-none placeholder:text-quiet focus:border-b-2";
const STARTERS = ["Hey! Loved the site 👋", "I'm building something and want your take", "Are you open to work?", "Feedback on the site:"];

/**
 * Talk to me: one chat per browser, under one name. Messages land on my
 * phone (Telegram); my replies show up here, live. The chat can be opened on
 * another device with its link, or deleted. A new name starts a fresh chat
 * (the old one is deleted), so a name always belongs to one conversation.
 */
export function Talk({ page = false }: { page?: boolean }) {
  const t = useTalk();
  const root = useRef<HTMLDivElement>(null);

  // …/talk#<code>: the chat opened from its link, say on another device.
  useEffect(() => {
    if (!page) return;
    if (adopt(location.hash.slice(1))) history.replaceState(null, "", location.pathname);
  }, [page]);

  // While the chat is on screen, my replies count as read.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => markRead(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => {
      io.disconnect();
      markRead(false);
    };
  }, []);

  return (
    <div id={page ? undefined : "talk"} ref={root} className={page ? "max-w-[46rem]" : "mt-20 max-w-[46rem] scroll-mt-24"}>
      <Availability live={t.live} />
      {!t.ready ? <div className="min-h-[30vh]" aria-hidden /> : t.chat ? <Conversation key={t.chat.id} chat={t.chat} /> : <NewChat name={t.name} />}
      {page ? <Terminal /> : null}
    </div>
  );
}

/* ---- whether I'm around ---- */

function Availability({ live }: { live: boolean | null }) {
  const presence = usePresence();
  const music = useMusic();
  const now = useNow();
  const place = presence?.place ?? { city: "Pune", tz: "Asia/Kolkata" };
  const last = [music?.tracks?.[0]?.at, presence?.github?.at].filter(Boolean).sort().at(-1) as string | undefined;
  const playing = !!music?.tracks?.find((x) => x.nowPlaying);
  const since = last && now ? now - Date.parse(last) : Infinity;
  const hour = now ? hourIn(place.tz, new Date(now)) : 12;
  const around = playing || since < 20 * 60_000;
  const state = presence?.status
    ? `“${presence.status.text}”`
    : around
      ? "I'm around right now"
      : hour >= 1 && hour < 8
        ? "Probably asleep. I'll see it in the morning"
        : "Away from the screen. I'll see it soon";

  return (
    <div className="border-ink mb-8 border-t pt-2">
      <p className="flex items-center gap-2 font-semibold">
        <span className="relative inline-flex size-2">
          {live && around ? <span className="bg-ink absolute inset-0 animate-ping rounded-full opacity-30 motion-reduce:hidden" /> : null}
          <span className={`relative size-2 rounded-full ${around ? "bg-ink" : "border-ink border"}`} />
        </span>
        {live ? "Talk to me, live" : "Talk to me"}
      </p>
      <p className="text-quiet mt-1">
        {state}
        {now ? `. It's ${clockIn(place.tz, new Date(now))} in ${place.city}.` : "."}{" "}
        {live ? "Messages go straight to my phone; my replies show up right here." : "I reply right here. If you've left, my reply waits for you on any page of the site."}
      </p>
    </div>
  );
}

/* ---- starting ---- */

function NewChat({ name }: { name: string }) {
  const [draft, setDraft] = useState("");
  return (
    <section aria-label="Start a chat">
      <p className="mb-5 text-[17px] leading-snug">Say hi, ask something, pitch me an idea. No email, no sign-up.</p>
      <label className="text-quiet mb-5 block max-w-[22rem] text-[13px]">
        Your name (optional, and it stays with this chat)
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Anonymous is fine" className={`${field} text-ink text-[16px]`} autoComplete="nickname" />
      </label>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Ways to start">
        {STARTERS.map((s) => (
          <button key={s} type="button" onClick={() => setDraft(s)} className="border-ink/25 hover:border-ink rounded-full border px-3 py-1 text-[13px]">
            {s}
          </button>
        ))}
      </div>
      <Composer value={draft} onChange={setDraft} placeholder="Write to me" />
    </section>
  );
}

/* ---- the chat ---- */

function Conversation({ chat }: { chat: Chat }) {
  const list = useRef<HTMLOListElement>(null);
  const [draft, setDraft] = useState("");
  const count = chat.messages.length;

  useLayoutEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [count]);

  return (
    <section aria-label="Your chat">
      <ChatHeader chat={chat} />
      {count ? (
        <ol ref={list} className="mb-5 max-h-[55vh] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {chat.messages.map((m, i) => (
            <Message key={m.id} m={m} name={chat.name} dayBreak={i === 0 || day(m.at) !== day(chat.messages[i - 1].at)} />
          ))}
        </ol>
      ) : (
        <p className="text-quiet mb-5">Loading your chat…</p>
      )}
      <Composer value={draft} onChange={setDraft} placeholder="Write back" />
    </section>
  );
}

const day = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function Message({ m, name, dayBreak }: { m: TalkMessage; name: string | null; dayBreak: boolean }) {
  const mine = m.side === "visitor";
  const time = new Date(m.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <>
      {dayBreak ? (
        <li aria-hidden className="text-quiet flex items-center gap-3 pt-2 text-[12px]">
          <span className="bg-ink/15 h-px flex-1" />
          {dayLabel(m.at)}
          <span className="bg-ink/15 h-px flex-1" />
        </li>
      ) : null}
      <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[min(46ch,88%)] ${mine ? "bg-ink/[0.06] rounded-[6px] px-3 py-2" : "border-ink border-l-2 py-0.5 pl-3"} ${m.pending ? "opacity-60" : ""}`}>
          <div className="text-[16px] leading-snug">
            <Rich text={m.text} />
          </div>
          <p className="text-quiet mt-1 text-[11.5px]">
            {mine ? name || "You" : "Onkar"} · {m.pending ? "sending…" : time}
          </p>
        </div>
      </li>
    </>
  );
}

function ChatHeader({ chat }: { chat: Chat }) {
  const [mode, setMode] = useState<"idle" | "name" | "delete">("idle");
  const [name, setNameDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startFresh(e?: React.FormEvent) {
    e?.preventDefault();
    if (name.trim() === (chat.name ?? "")) return setMode("idle");
    setBusy(true);
    const r = await changeName(name);
    setBusy(false);
    if (!r.ok) setNote(r.reason);
  }
  async function doDelete() {
    setBusy(true);
    const r = await remove();
    setBusy(false);
    if (!r.ok) setNote(r.reason);
  }
  async function copyLink() {
    const url = `${location.origin}/talk#${chat.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied. Open it on another device to carry on there. Anyone with the link can read this chat, so keep it to yourself.");
    } catch {
      setNote(url);
    }
  }

  const btn = "underline decoration-1 underline-offset-4 hover:decoration-2 disabled:opacity-50";
  return (
    <div className="border-ink/20 mb-4 border-b pb-3">
      {mode === "name" ? (
        <form onSubmit={startFresh}>
          <p className="mb-2 text-[15px]">
            A new name starts a fresh chat. <span className="text-quiet">This one, and everything in it, is deleted, here and on my phone.</span>
          </p>
          <div className="flex flex-wrap items-baseline gap-3">
            <label className="sr-only" htmlFor="talk-new-name">
              Your new name
            </label>
            <input id="talk-new-name" value={name} onChange={(e) => setNameDraft(e.target.value)} maxLength={40} placeholder="New name" autoFocus className={`${field} max-w-[16rem] flex-1 text-[16px]`} />
            <button className={`${btn} font-semibold`} disabled={busy || !name.trim() || name.trim() === (chat.name ?? "")}>
              {busy ? "Starting…" : "Start fresh"}
            </button>
            <button type="button" className={btn} onClick={() => (setMode("idle"), setNote(null))}>
              Keep this chat
            </button>
          </div>
        </form>
      ) : mode === "delete" ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span>Delete this chat for good? It goes from here and from my phone.</span>
          <button type="button" className={`${btn} font-semibold text-[#c22]`} onClick={doDelete} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button type="button" className={btn} onClick={() => setMode("idle")}>
            Keep it
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p>
            <span className="text-quiet">You&apos;re </span>
            <span className="font-semibold">{chat.name || "nameless"}</span>
            <span className="text-quiet"> here</span>
          </p>
          <p className="text-quiet flex gap-4 text-[13px]">
            <button type="button" className={btn} onClick={() => (setNameDraft(""), setNote(null), setMode("name"))}>
              Change name
            </button>
            <button type="button" className={btn} onClick={copyLink}>
              Copy link
            </button>
            <button type="button" className={btn} onClick={() => (setNote(null), setMode("delete"))}>
              Delete
            </button>
          </p>
        </div>
      )}
      {note ? (
        <p className="text-quiet mt-2 text-[13px] [overflow-wrap:anywhere]" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/* ---- writing ---- */

function Composer({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<{ kind: "idle" | "sending" | "error" | "note"; text?: string }>({ kind: "idle" });
  const [website, setWebsite] = useState("");

  // Grow with the text, up to about ten lines.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [value]);
  useEffect(() => {
    if (value) box.current?.focus();
  }, [value]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = value.trim();
    if (!text || state.kind === "sending" || website) return;
    setState({ kind: "sending" });
    const r = await send(text);
    if (!r.ok) return setState({ kind: "error", text: r.reason });
    onChange("");
    setState(
      r.delivered
        ? { kind: "idle" }
        : r.live
          ? { kind: "note", text: "Saved, but my phone didn't get it just now. I'll see it soon." }
          : { kind: "note", text: "Sent. I'll answer right here. If you've left by then, you'll see it the next time you open the site." },
    );
  }

  const left = MAX - value.length;
  return (
    <form onSubmit={submit}>
      {/* Only bots fill this in. */}
      <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] size-px opacity-0" name="website" />
      <div className="flex items-end gap-4">
        <textarea
          ref={box}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="Your message"
          className={`${field} min-h-[2.4rem] flex-1 resize-none text-[16px] leading-snug`}
        />
        <button type="submit" disabled={!value.trim() || state.kind === "sending"} className="border-ink disabled:text-quiet shrink-0 border-t pt-1.5 font-semibold">
          {state.kind === "sending" ? "Sending…" : "Send"}
        </button>
      </div>
      <p className="text-quiet mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12px]">
        <span>
          <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift+Enter</kbd> for a new line · <code className="font-mono">`code`</code> and <code className="font-mono">```blocks```</code> work · links are fine
        </span>
        {left < 300 ? <span className={left < 50 ? "text-ink" : ""}>{left} left</span> : null}
      </p>
      {state.text ? (
        <p className={`mt-2 ${state.kind === "error" ? "text-ink" : "text-quiet"}`} role={state.kind === "error" ? "alert" : "status"}>
          {state.text}
        </p>
      ) : null}
      <p className="text-quiet mt-3 text-[12px]">
        Only you and I can read these.{" "}
        <Link href="/privacy#talk" className="hover:text-ink underline decoration-1 underline-offset-4">
          How it works
        </Link>
      </p>
    </form>
  );
}

/* ---- from a terminal ---- */

const HOST = "onkaryaglewad.in";
const CMDS: [string, string][] = [
  [`curl -L -d "hey, loved the site" ${HOST}/talk`, "start a chat (you get a code back)"],
  [`curl -L -d "text=hi&name=Ana" ${HOST}/talk`, "with a name"],
  [`curl -L ${HOST}/talk/<code>`, "read it, with my replies"],
  [`curl -L -d "one more thing" ${HOST}/talk/<code>`, "keep going"],
];

function Terminal() {
  return (
    <details className="border-ink group mt-16 border-t pt-2">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 font-semibold">
        Talk from a terminal
        <span className="text-quiet font-normal group-open:hidden">for developers ↓</span>
      </summary>
      <p className="text-quiet mt-3 max-w-[64ch]">
        Same chat, no browser. It reaches my phone the same way, and a chat started in the terminal opens here too with{" "}
        <code className="font-mono text-[0.9em]">{HOST}/talk#&lt;code&gt;</code>. Same limits as the page.
      </p>
      <ul className="mt-4 space-y-2">
        {CMDS.map(([cmd, what]) => (
          <li key={cmd}>
            <CopyLine cmd={cmd} />
            <span className="text-quiet ml-1 text-[12px]">{what}</span>
          </li>
        ))}
      </ul>
      <p className="text-quiet mt-4 text-[12px]">
        Or the JSON API: <code className="font-mono">GET/POST/PATCH/DELETE /api/talk</code>, described at the top of{" "}
        <a href="https://github.com/once-human/1618/blob/main/src/app/api/talk/route.ts" className="hover:text-ink underline decoration-1 underline-offset-4" target="_blank" rel="noopener noreferrer">
          its source
        </a>
        .
      </p>
    </details>
  );
}

function CopyLine({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="bg-ink text-paper inline-flex max-w-full items-center gap-3 rounded-[4px] px-3 py-1.5 font-mono text-[12.5px]">
      <span className="truncate">
        <span className="opacity-50">$ </span>
        {cmd}
      </span>
      <button
        type="button"
        className="shrink-0 opacity-60 hover:opacity-100"
        onClick={() =>
          void navigator.clipboard?.writeText(cmd).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          })
        }
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}

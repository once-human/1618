"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Rich } from "@/components/talk/Rich";
import { act, refresh, type AdminState, type Thread } from "./store";
import { Button, Chip, Confirm, Empty, Icon, ago, flag, input, town, when } from "./ui";
import { go } from "./AdminApp";

interface Msg {
  id: number;
  side: "visitor" | "me";
  text: string;
  at: string;
}
type Filter = "waiting" | "all" | "blocked";

/** Every conversation: the list, and the open one, with replies straight from here. */
export function TalkView({ data, open }: { data: AdminState; open: string | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const threads = data.talk.threads;
  const waiting = (t: Thread) => t.last?.side === "visitor" && !t.blocked;
  const shown = threads
    .filter((t) => (filter === "waiting" ? waiting(t) : filter === "blocked" ? t.blocked : true))
    .filter((t) => !q || `${t.name ?? ""} ${t.city ?? ""} ${t.last?.text ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const current = threads.find((t) => t.id === open) ?? null;
  const tg = data.talk.telegram;

  return (
    <div className="space-y-4">
      {!tg.owner ? (
        <p className="bg-a-signal-soft rounded-xl px-4 py-3 text-[14.5px]">
          Telegram isn&apos;t connected, so new messages only show up here.{" "}
          <a href="#site" className="font-semibold underline">
            Connect it
          </a>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(17rem,22rem)_1fr]">
        {/* On phones the list and the chat take turns. */}
        <div className={`${current ? "hidden md:block" : ""} min-w-0`}>
          <div className="mb-3 flex flex-wrap gap-2">
            {(["all", "waiting", "blocked"] as Filter[]).map((f) => (
              <Chip key={f} on={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? `All ${threads.length}` : f === "waiting" ? `Waiting ${threads.filter(waiting).length}` : `Blocked ${threads.filter((t) => t.blocked).length}`}
              </Chip>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, towns, messages" className={`${input} mb-3`} aria-label="Search chats" />
          {shown.length ? (
            <ul className="bg-a-panel border-a-line divide-a-line divide-y overflow-hidden rounded-2xl border">
              {shown.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => go(`talk/${t.id}`)}
                    aria-current={t.id === open ? "true" : undefined}
                    className={`block w-full px-4 py-3 text-left ${t.id === open ? "bg-a-soft" : "hover:bg-a-soft/60"}`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        {waiting(t) ? <span className="bg-a-signal size-2 shrink-0 rounded-full" aria-label="waiting on you" /> : null}
                        <span className={`truncate ${waiting(t) ? "font-semibold" : "font-medium"}`}>{t.name || "No name"}</span>
                        {t.blocked ? <span className="text-a-bad text-[12px]">blocked</span> : null}
                      </span>
                      <span className="text-a-quiet shrink-0 text-[12px]">{ago(t.lastAt)}</span>
                    </span>
                    <span className="text-a-quiet block truncate text-[13px]">
                      {flag(t.country)} {t.city ?? "Somewhere"} · {t.count} messages{t.via === "terminal" ? " · terminal" : ""}
                    </span>
                    <span className="mt-0.5 block truncate text-[14px]">
                      {t.last ? `${t.last.side === "me" ? "You: " : ""}${t.last.text.replace(/\s+/g, " ")}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{threads.length ? "Nothing matches." : "No chats yet. They'll show up here, and on your phone once Telegram is connected."}</Empty>
          )}
        </div>

        <div className={`${current ? "" : "hidden md:block"} min-w-0`}>
          {current ? <Conversation key={current.id} t={current} /> : <div className="text-a-quiet border-a-line hidden h-full min-h-[40vh] place-items-center rounded-2xl border border-dashed text-[14px] md:grid">Pick a chat.</div>}
        </div>
      </div>
    </div>
  );
}

function Conversation({ t }: { t: Thread }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/admin/thread?id=${t.id}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { ok: boolean; messages?: Msg[] }) => live && (d.ok ? setMsgs(d.messages ?? []) : go("talk")))
        .catch(() => {});
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [t.id]);

  useLayoutEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs?.length]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy("send");
    const r = await act<{ message: Msg }>("reply", { thread: t.id, text: body });
    setBusy(null);
    if (r) {
      setText("");
      setMsgs((m) => [...(m ?? []), r.message]);
    }
  }

  return (
    <section className="bg-a-panel border-a-line flex min-h-[60vh] flex-col rounded-2xl border md:h-[calc(100svh-9rem)]" aria-label={`Chat with ${t.name || "no name"}`}>
      <header className="border-a-line flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-start gap-2">
          <Button kind="quiet" className="-ml-2 px-1.5 md:hidden" onClick={() => go("talk")} aria-label="Back to chats">
            <Icon name="back" />
          </Button>
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {t.name || "No name"} {t.blocked ? <span className="text-a-bad text-[13px] font-normal">blocked</span> : null}
            </p>
            <p className="text-a-quiet text-[13px]">
              {flag(t.country)} {town(t.city, t.country)} · started {when(t.createdAt)}
              {t.via === "terminal" ? " from a terminal" : t.page ? ` on ${t.page}` : ""} · #{t.id.slice(0, 4)}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {t.blocked ? (
            <Button kind="quiet" busy={busy === "block"} onClick={async () => (setBusy("block"), await act("unblock", { thread: t.id }, "Unblocked"), setBusy(null))}>
              Unblock
            </Button>
          ) : (
            <Confirm label="Block" yes="Block them" busy={busy === "block"} onYes={async () => (setBusy("block"), await act("block", { thread: t.id }, "Blocked. Their network can't start chats today."), setBusy(null))} />
          )}
          <Confirm
            label="Delete"
            yes="Delete chat"
            busy={busy === "delete"}
            onYes={async () => {
              setBusy("delete");
              const r = await act("deleteThread", { thread: t.id }, "Chat deleted");
              setBusy(null);
              if (r) {
                go("talk");
                void refresh();
              }
            }}
          />
        </div>
      </header>

      <ol ref={list} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs === null ? (
          <li className="text-a-quiet text-[14px]">Loading…</li>
        ) : (
          msgs.map((m) => (
            <li key={m.id} className={`flex ${m.side === "me" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[min(48ch,85%)] rounded-2xl px-3.5 py-2 ${m.side === "me" ? "bg-a-ink text-a-bg rounded-br-md" : "bg-a-soft rounded-bl-md"}`}>
                <div className="text-[15px] leading-snug">
                  <Rich text={m.text} />
                </div>
                <p className={`mt-1 text-[11.5px] ${m.side === "me" ? "opacity-60" : "text-a-quiet"}`}>{when(m.at)}</p>
              </div>
            </li>
          ))
        )}
      </ol>

      <form onSubmit={send} className="border-a-line flex items-end gap-2 border-t p-3">
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={t.blocked ? "They're blocked, but you can still reply" : "Reply (Enter sends, Shift+Enter for a new line)"}
          aria-label="Your reply"
          className={`${input} resize-none`}
        />
        <Button type="submit" kind="signal" busy={busy === "send"} disabled={!text.trim()} className="h-[46px] px-4">
          <Icon name="send" className="size-4" /> Send
        </Button>
      </form>
    </section>
  );
}

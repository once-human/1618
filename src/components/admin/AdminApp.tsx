"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { act, isNew, refresh, useAdmin, usePeople, useToasts } from "./store";
import { Icon, ago, clockIn, useTick } from "./ui";
import { NowView } from "./NowView";
import { TalkView } from "./TalkView";
import { PostsView } from "./PostsView";
import { YouView } from "./YouView";
import { SiteView } from "./SiteView";
import { PrivacyView } from "./PrivacyView";

export type Tab = "now" | "talk" | "posts" | "you" | "privacy" | "site";
export type Theme = "dark" | "light";
const TABS: { id: Tab; label: string; word: string; note: string }[] = [
  { id: "now", label: "now", word: "now", note: "What's happening on the site right now" },
  { id: "talk", label: "talk", word: "talk", note: "Every chat, and what's waiting on you" },
  { id: "posts", label: "posts", word: "posts", note: "Songs people sent, and the guestbook" },
  { id: "you", label: "you", word: "you", note: "How the site shows you: status, place, bedtime, health" },
  { id: "privacy", label: "privacy", word: "privacy", note: "Who visited, what's kept, and who can get in" },
  { id: "site", label: "site", word: "site", note: "Sources, the history store, Telegram, shortcuts" },
];

// The open section lives in the address (#talk, #talk/<chat>), so back works and links can point anywhere.
const readHash = () => (typeof location === "undefined" ? "" : location.hash.slice(1));
const onHash = (f: () => void) => (window.addEventListener("hashchange", f), () => window.removeEventListener("hashchange", f));
export function go(hash: string) {
  if (readHash() !== hash) location.hash = hash;
}

/** /admin: my control room for the site. */
export function AdminApp({ theme: initialTheme }: { theme: Theme }) {
  const hash = useSyncExternalStore(onHash, readHash, () => "");
  const [tabPart, sub] = hash.split("/");
  const tab: Tab = TABS.some((t) => t.id === tabPart) ? (tabPart as Tab) : "now";
  const { data, fetchedAt, failed } = useAdmin();
  const people = usePeople();
  const toasts = useToasts();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useTick(15_000);

  // 1–6 jump between sections (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]")) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < TABS.length) go(TABS[i].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Picked on another device since this page loaded: follow it.
  const saved = data?.theme;
  useEffect(() => {
    if (saved && saved !== theme) apply(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the saved choice changes
  }, [saved]);

  function apply(t: Theme) {
    setTheme(t);
    document.querySelector(".admin")?.setAttribute("data-theme", t);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#000000" : "#ffffff");
  }
  async function flip() {
    const t: Theme = theme === "dark" ? "light" : "dark";
    apply(t);
    await act("theme", { theme: t });
  }

  const waiting = data?.talk.threads.filter(isNew).length ?? 0;
  const badges: Partial<Record<Tab, number>> = { talk: waiting, now: people?.length ?? 0 };
  const current = TABS.find((t) => t.id === tab)!;
  const cell = "border-t pt-1.5 truncate";

  return (
    <div className="px-4 md:px-6">
      {/* The contents line, like the site's: a rule above each item. */}
      <nav aria-label="Sections" className="bg-a-bg/95 sticky top-0 z-40 -mx-4 grid grid-cols-4 gap-3 px-4 pt-3 pb-2 text-[13px] backdrop-blur sm:text-[15px] md:-mx-6 md:grid-cols-10 md:gap-4 md:px-6">
        <a href="#now" className={`${cell} border-a-ink font-semibold`}>
          1618 <span className="text-a-quiet font-normal">admin</span>
        </a>
        {TABS.map((t, i) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            title={`${t.word} (press ${i + 1})`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`${cell} hidden md:flex md:items-baseline md:gap-1.5 ${tab === t.id ? "border-a-ink font-semibold" : "border-a-line text-a-quiet hover:text-a-ink hover:border-a-ink"}`}
          >
            {t.label}
            <Badge id={t.id} n={badges[t.id]} />
          </a>
        ))}
        <button type="button" onClick={flip} className={`${cell} border-a-line text-a-quiet hover:text-a-ink hover:border-a-ink flex items-center gap-1.5 text-left md:col-start-8`} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"}`}>
          <Icon name={theme === "dark" ? "sun" : "moon"} className="size-4" />
          {theme === "dark" ? "light" : "dark"}
        </button>
        <a href="/" target="_blank" rel="noopener" className={`${cell} border-a-line text-a-quiet hover:text-a-ink hover:border-a-ink`}>
          the site ↗
        </a>
        <form method="post" action="/admin/logout" className={`${cell} border-a-line`}>
          <button className="text-a-quiet hover:text-a-ink">log out</button>
        </form>
      </nav>

      <main className="mx-auto max-w-[1500px] pt-8 pb-36 md:pt-12 md:pb-20">
        <header className="mb-10 md:mb-14">
          <h1 className="bigword -ml-[0.04em] pb-[0.18em] text-[clamp(4rem,14vw,11rem)]">{current.word}</h1>
          <div className="text-a-quiet mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[14px]">
            <p>{current.note}</p>
            <p className="flex items-center gap-2">
              {data ? (
                <>
                  {data.place.city} {clockIn(data.place.tz)} · {failed ? <span className="text-a-bad">offline</span> : `updated ${ago(fetchedAt)}`}
                </>
              ) : null}
              <button type="button" aria-label="Refresh" onClick={() => void refresh()} className="hover:text-a-ink">
                <Icon name="refresh" className="size-4" />
              </button>
            </p>
          </div>
        </header>

        {!data ? (
          <Loading failed={failed} />
        ) : tab === "now" ? (
          <NowView data={data} people={people} />
        ) : tab === "talk" ? (
          <TalkView data={data} open={sub ?? null} />
        ) : tab === "posts" ? (
          <PostsView data={data} />
        ) : tab === "you" ? (
          <YouView data={data} />
        ) : tab === "privacy" ? (
          <PrivacyView data={data} open={sub ?? null} />
        ) : (
          <SiteView data={data} />
        )}
      </main>

      {/* Phones: the sections at the bottom, in thumb reach. */}
      <nav aria-label="Sections" className="bg-a-bg/95 fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 gap-2 px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] text-[12.5px] backdrop-blur md:hidden">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`relative border-t pt-1.5 pb-1 ${tab === t.id ? "border-a-ink font-semibold" : "border-a-line text-a-quiet"}`}
          >
            {t.label}
            <span className="absolute top-0.5 right-0">
              <Badge id={t.id} n={badges[t.id]} />
            </span>
          </a>
        ))}
      </nav>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <p key={t.id} className={`pointer-events-auto px-4 py-2.5 text-[14px] ${t.bad ? "bg-a-bad text-white" : "bg-a-ink text-a-bg"}`}>
            {t.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function Badge({ id, n }: { id: Tab; n?: number }) {
  if (!n) return null;
  // Waiting chats are the one thing that needs me: those get the signal colour.
  return id === "talk" ? (
    <span className="bg-a-signal px-1 text-[11px] leading-[16px] font-semibold text-white tabular-nums">{n}</span>
  ) : (
    <span className="text-a-quiet text-[11px] font-normal tabular-nums">{n}</span>
  );
}

function Loading({ failed }: { failed: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="text-a-quiet grid min-h-[50vh] place-items-center text-[14px]">
      {failed ? (
        <p>
          Couldn&apos;t reach the site.{" "}
          <button className="text-a-ink underline" onClick={() => void refresh()}>
            Try again
          </button>
        </p>
      ) : slow ? (
        "Still loading. The database may be waking up."
      ) : (
        ""
      )}
    </div>
  );
}

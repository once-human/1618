"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isNew, refresh, useAdmin, usePeople, useToasts } from "./store";
import { Button, Icon, ago, clockIn, useTick } from "./ui";
import { NowView } from "./NowView";
import { TalkView } from "./TalkView";
import { PostsView } from "./PostsView";
import { YouView } from "./YouView";
import { SiteView } from "./SiteView";

export type Tab = "now" | "talk" | "posts" | "you" | "site";
const TABS: { id: Tab; label: string; title: string }[] = [
  { id: "now", label: "Now", title: "Right now" },
  { id: "talk", label: "Talk", title: "Talk" },
  { id: "posts", label: "Posts", title: "Songs and guestbook" },
  { id: "you", label: "You", title: "You, on the site" },
  { id: "site", label: "Site", title: "The site" },
];

// The open section lives in the address (#talk, #talk/<chat>), so back works and links can point anywhere.
const readHash = () => (typeof location === "undefined" ? "" : location.hash.slice(1));
const onHash = (f: () => void) => (window.addEventListener("hashchange", f), () => window.removeEventListener("hashchange", f));
export function go(hash: string) {
  if (readHash() !== hash) location.hash = hash;
}

/** /admin: my control room for the site. */
export function AdminApp() {
  const hash = useSyncExternalStore(onHash, readHash, () => "");
  const [tabPart, sub] = hash.split("/");
  const tab: Tab = TABS.some((t) => t.id === tabPart) ? (tabPart as Tab) : "now";
  const { data, fetchedAt, failed } = useAdmin();
  const people = usePeople();
  const toasts = useToasts();
  useTick(15_000);

  // 1–5 jump between sections (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]")) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < TABS.length) go(TABS[i].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const waiting = data?.talk.threads.filter(isNew).length ?? 0;
  const badges: Partial<Record<Tab, number>> = { talk: waiting, now: people?.length ?? 0 };
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="mx-auto flex max-w-[1440px]">
      {/* Wide screens: the side. */}
      <aside className="border-a-line sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r px-4 py-6 md:flex">
        <a href="#now" className="wide px-2 text-[30px] leading-none font-bold tracking-tight">
          1618
        </a>
        <p className="text-a-quiet mt-1 mb-8 px-2 text-[13px]">Admin</p>
        <nav aria-label="Sections" className="space-y-0.5">
          {TABS.map((t, i) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              title={`${t.label} (press ${i + 1})`}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] ${tab === t.id ? "bg-a-soft font-semibold" : "text-a-quiet hover:text-a-ink hover:bg-a-soft/60"}`}
            >
              <Icon name={t.id} />
              <span className="flex-1">{t.label}</span>
              <Badge id={t.id} n={badges[t.id]} />
            </a>
          ))}
        </nav>
        <div className="mt-auto space-y-1 text-[14px]">
          <a href="/" target="_blank" rel="noopener" className="text-a-quiet hover:text-a-ink hover:bg-a-soft flex items-center gap-3 rounded-lg px-2 py-2">
            <Icon name="ext" /> Open the site
          </a>
          <form method="post" action="/admin/logout">
            <button className="text-a-quiet hover:text-a-ink hover:bg-a-soft flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left">
              <Icon name="back" /> Log out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pt-5 pb-32 md:px-8 md:pt-7 md:pb-16">
        <header className="mb-5 flex items-center justify-between gap-4 md:mb-7">
          <div className="min-w-0">
            <p className="wide text-a-quiet text-[13px] font-bold md:hidden">1618</p>
            <h1 className="wide truncate text-[26px] leading-tight font-bold tracking-tight md:text-[32px]">{current.title}</h1>
          </div>
          <div className="text-a-quiet flex shrink-0 items-center gap-2 text-[13px]">
            {data ? (
              <span className="hidden text-right sm:block">
                {data.place.city} {clockIn(data.place.tz)}
                <br />
                {failed ? <span className="text-a-bad">Offline</span> : `Updated ${ago(fetchedAt)}`}
              </span>
            ) : null}
            <Button kind="quiet" aria-label="Refresh" onClick={() => void refresh()} className="px-2">
              <Icon name="refresh" />
            </Button>
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
        ) : (
          <SiteView data={data} />
        )}
      </main>

      {/* Phones: tabs at the bottom, in thumb reach. */}
      <nav aria-label="Sections" className="bg-a-panel/90 border-a-line fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? "page" : undefined} className={`relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] ${tab === t.id ? "text-a-ink font-semibold" : "text-a-quiet"}`}>
            <Icon name={t.id} className="size-[22px]" />
            {t.label}
            <span className="absolute top-1 left-1/2 ml-2">
              <Badge id={t.id} n={badges[t.id]} />
            </span>
          </a>
        ))}
      </nav>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <p key={t.id} className={`pointer-events-auto rounded-xl px-4 py-2.5 text-[14px] shadow-lg ${t.bad ? "bg-a-bad text-white" : "bg-a-ink text-a-bg"}`}>
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
    <span className="bg-a-signal rounded-full px-1.5 text-[11px] leading-[18px] font-semibold text-white">{n}</span>
  ) : (
    <span className="bg-a-soft text-a-quiet rounded-full px-1.5 text-[11px] leading-[18px] font-semibold">{n}</span>
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

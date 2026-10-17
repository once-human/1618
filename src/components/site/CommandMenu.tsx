"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { scrollToId } from "@/components/scroll/scrollTo";
import { togglePreview, useMusic } from "@/lib/presence/client";
import { profile } from "@/content/profile";

interface Item {
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** Open the menu from anywhere (the footer's ⌘K, for one). */
export const openMenu = () => window.dispatchEvent(new Event("open-menu"));

/**
 * ⌘K (or Ctrl+K, or "/"): jump anywhere on the site, or do the live things,
 * like play a preview of what I'm listening to right now. Plain list, typed
 * to filter, arrows and Enter to choose.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const path = usePathname();
  const music = useMusic();
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-menu", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-menu", onOpen);
    };
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQuery("");
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    } else if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };
    const section = (id: string) => () => {
      setOpen(false);
      if (path === "/") scrollToId(id);
      else router.push(`/#${id}`);
    };
    const playing = music?.tracks?.find((t) => t.nowPlaying) ?? music?.tracks?.[0] ?? null;
    const list: Item[] = [];
    if (playing) {
      if (playing.preview)
        list.push({
          group: "Live",
          label: `${playing.nowPlaying ? "Hear what I'm playing" : "Hear what I played last"}: ${playing.track}`,
          hint: "30s preview",
          run: () => {
            togglePreview(`${playing.track}|${playing.artist}`, playing.preview!);
            setOpen(false);
          },
        });
      list.push({
        group: "Live",
        label: `Open ${playing.track} on Apple Music`,
        run: () => {
          window.open(playing.url, "_blank", "noopener");
          setOpen(false);
        },
      });
    }
    list.push(
      { group: "Live", label: "Talk to me", hint: "/talk", run: go("/talk") },
      { group: "Live", label: "Send me a song", run: section("send-a-song") },
      { group: "Live", label: "Sign the guestbook", run: section("guestbook") },
      { group: "This page", label: "The day", run: section("top") },
      { group: "This page", label: "Work", run: section("work") },
      { group: "This page", label: "Listening", run: section("listening") },
      { group: "This page", label: "Saved on Pinterest", run: section("saved") },
      { group: "This page", label: "Say hi", run: section("say-hi") },
      { group: "Pages", label: "Now: what I'm up to, the last 48 hours, on repeat", hint: "/now", run: go("/now") },
      { group: "Pages", label: "History: the year so far, top tens, any stretch", hint: "/history", run: go("/history") },
      { group: "Pages", label: "All work", hint: "/work", run: go("/work") },
      { group: "Pages", label: "Status: everything this site does, and whether it's working", hint: "/status", run: go("/status") },
      { group: "Pages", label: "Privacy", hint: "/privacy", run: go("/privacy") },
    );
    for (const [k, href] of Object.entries(profile.links))
      if (href && k !== "email")
        list.push({
          group: "Elsewhere",
          label: k[0].toUpperCase() + k.slice(1),
          run: () => {
            window.open(href, "_blank", "noopener");
            setOpen(false);
          },
        });
    return list;
  }, [music, path, router]);

  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => `${i.group} ${i.label} ${i.hint ?? ""}`.toLowerCase().includes(q)) : items;
  const current = Math.min(active, Math.max(0, shown.length - 1));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % Math.max(1, shown.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + shown.length) % Math.max(1, shown.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      shown[current]?.run();
    }
  }

  let lastGroup = "";
  return (
    <dialog
      ref={dialog}
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === dialog.current && setOpen(false)}
      aria-label="Menu"
      className="mx-auto mt-[12vh] w-[min(92vw,560px)] bg-paper p-0 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop:bg-ink/40"
    >
      <div onKeyDown={onKeyDown}>
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Go anywhere, or do something live"
          aria-label="Search the menu"
          className="w-full border-b border-ink bg-transparent px-4 py-3 text-[17px] outline-none placeholder:text-quiet"
        />
        <ul className="max-h-[55vh] overflow-y-auto py-2" role="listbox">
          {shown.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <li key={`${it.group}${it.label}`}>
                {head ? <p className="px-4 pt-3 pb-1 text-[11px] tracking-wide text-quiet uppercase">{head}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === current}
                  onMouseEnter={() => setActive(i)}
                  onClick={it.run}
                  className={`flex w-full items-baseline justify-between gap-4 px-4 py-1.5 text-left ${i === current ? "bg-ink text-paper" : ""}`}
                >
                  <span className="truncate">{it.label}</span>
                  {it.hint ? <span className={`shrink-0 text-[12px] ${i === current ? "text-paper/70" : "text-quiet"}`}>{it.hint}</span> : null}
                </button>
              </li>
            );
          })}
          {!shown.length && <li className="px-4 py-3 text-quiet">Nothing matches.</li>}
        </ul>
        <p className="flex justify-between border-t border-ink/20 px-4 py-2 text-[11px] text-quiet">
          <span>↑↓ to move, enter to go</span>
          <span>esc to close</span>
        </p>
      </div>
    </dialog>
  );
}

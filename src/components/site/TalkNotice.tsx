"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTalk } from "@/lib/talk/client";
import { scrollToId } from "@/components/scroll/SmoothScroll";

/**
 * If I reply while the visitor is somewhere else on the site (or in another
 * tab), a small notice says so, and the tab title shows it too.
 */
const hasThread = () => {
  try {
    return !!localStorage.getItem("talk-thread");
  } catch {
    return false;
  }
};
const onThread = (f: () => void) => {
  window.addEventListener("storage", f);
  window.addEventListener("talk-thread", f);
  return () => {
    window.removeEventListener("storage", f);
    window.removeEventListener("talk-thread", f);
  };
};

export function TalkNotice() {
  // Only browsers that have started a conversation keep a line open on every page.
  const has = useSyncExternalStore(onThread, hasThread, () => false);
  return has ? <Notice /> : null;
}

function Notice() {
  const { unread, thread } = useTalk();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!thread) return;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = unread ? `(${unread}) ${base}` : base;
  }, [unread, thread]);

  if (!unread) return null;
  const open = () => (path === "/" ? scrollToId("talk") : router.push("/talk"));
  return (
    <button
      type="button"
      onClick={open}
      className="bg-ink text-paper fixed bottom-14 left-1/2 z-50 -translate-x-1/2 px-4 py-2 text-[15px] shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
    >
      Onkar replied{unread > 1 ? ` (${unread})` : ""} →
    </button>
  );
}

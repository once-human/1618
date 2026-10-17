"use client";

import Link from "next/link";
import { useHere } from "@/lib/presence/client";

/** "● 3 here": how many people are on the site right now, in the footer of every page. */
export function HereCount() {
  const here = useHere();
  if (!here || here.people < 1) return null;
  return (
    <Link
      href="/status#here"
      className="hover:underline"
      aria-label={here.people === 1 ? "Just you on the site right now" : `${here.people} people on the site right now`}
    >
      <span className="bg-ink mr-1.5 inline-block size-1.5 -translate-y-[0.1em] rounded-full align-middle" />
      {here.people === 1 ? "just you" : `${here.people} here`}
    </Link>
  );
}

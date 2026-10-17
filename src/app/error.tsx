"use client";

import Link from "next/link";
import { useEffect } from "react";

/** When something on a page breaks: say so plainly, offer a retry and a way back. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-svh flex-col justify-between px-4 py-4">
      <p className="border-t border-ink pt-1.5">Something on this page broke. It&apos;s not you.</p>
      <p className="bigword tnum text-[clamp(6rem,30vw,30rem)]">05:00</p>
      <p className="flex gap-6 border-t border-ink pt-1.5">
        <button type="button" onClick={reset} className="underline-offset-4 hover:underline">
          Try again
        </button>
        <Link href="/" className="underline-offset-4 hover:underline">
          Back to the day
        </Link>
      </p>
    </main>
  );
}

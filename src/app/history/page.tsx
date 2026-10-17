import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageShell } from "@/components/pages/PageShell";
import { HistorySearch } from "@/components/history/HistorySearch";
import { HistoryOverview } from "@/components/history/HistoryOverview";
import { Replay } from "@/components/home/Replay";
import { Seed } from "@/components/site/Seed";
import { getReplay } from "@/lib/history/query";

export const metadata: Metadata = pageMeta("History", "Everything I've played, saved, pushed and run, searchable by week, month, year or any dates.", "/history");

/** The year so far, sent with the page so it doesn't arrive late and push everything down. */
async function SeedReplay() {
  await connection(); // at request time, never baked in at build
  return <Seed replay={await getReplay().catch(() => null)} />;
}

export default function HistoryPage() {
  return (
    <PageShell word="history">
      <p className="mb-12 max-w-[52ch] border-t border-ink pt-1.5 text-[17px] leading-snug">
        Everything the live parts of this site have ever seen, kept: every song I&apos;ve played, every pin, every push,
        every run. The year so far first, then every period side by side, the top tens, and any stretch you like.
      </p>
      <Suspense fallback={null}>
        <SeedReplay />
      </Suspense>
      <Replay />
      <div className="mt-24">
        <HistoryOverview />
      </div>
      <section className="mt-24">
        <h2 className="mb-6 border-t border-ink pt-1.5 font-semibold">Look back at any stretch</h2>
        <Suspense fallback={<div className="min-h-[60vh]" aria-hidden />}>
          <HistorySearch />
        </Suspense>
      </section>
    </PageShell>
  );
}

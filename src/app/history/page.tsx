import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/pages/PageShell";
import { HistorySearch } from "@/components/history/HistorySearch";
import { HistoryOverview } from "@/components/history/HistoryOverview";
import { Replay } from "@/components/home/Replay";

export const metadata: Metadata = {
  title: "History, Onkar Yaglewad",
  description: "Everything I've played, saved, pushed and run, searchable by week, month, year or any dates.",
  alternates: { canonical: "/history" },
};

export default function HistoryPage() {
  return (
    <PageShell word="history">
      <p className="mb-12 max-w-[52ch] border-t border-ink pt-1.5 text-[17px] leading-snug">
        Everything the live parts of this site have ever seen, kept: every song I&apos;ve played, every pin, every push,
        every run. The year so far first, then every period side by side, the top tens, and any stretch you like.
      </p>
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

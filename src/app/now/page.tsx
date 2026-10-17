import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageShell } from "@/components/pages/PageShell";
import { NowPage } from "@/components/pages/Now";
import { Seed } from "@/components/site/Seed";
import { snapshot } from "@/lib/seed";
import { getTimeline } from "@/lib/history/timeline";
import { getSaved } from "@/lib/presence/pinterest";
import type { ListeningStats } from "@/lib/presence/types";

export const metadata: Metadata = pageMeta("Now", "What I'm up to right now. Most of it writes itself.", "/now");

/** The slower parts of /now, sent with the page so nothing arrives late. */
async function SeedNow() {
  await connection(); // at request time, never baked in at build
  const [listening, timeline, saved] = await Promise.all([
    snapshot<ListeningStats>("/api/listening", "slow"),
    getTimeline().catch(() => null),
    getSaved(4).catch(() => null),
  ]);
  return <Seed listening={listening} timeline={timeline} saved={saved} />;
}

export default function Now() {
  return (
    <PageShell word="now">
      <Suspense fallback={null}>
        <SeedNow />
      </Suspense>
      <NowPage />
    </PageShell>
  );
}

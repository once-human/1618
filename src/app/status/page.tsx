import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageShell } from "@/components/pages/PageShell";
import { StatusPage } from "@/components/pages/Status";
import { checkSources } from "@/lib/history/sources";
import { checkFeatures } from "@/lib/features";

export const metadata: Metadata = pageMeta("Status", "Everything this site does, where to find it, and whether it's working right now.", "/status");

/** The checks are cached for a minute, so the page comes with its answers instead of fetching them after. */
async function WithChecks() {
  await connection();
  const [sources, features] = await Promise.all([checkSources(), checkFeatures().catch(() => [])]);
  return <StatusPage initial={{ ...sources, features }} />;
}

export default function Status() {
  return (
    <PageShell word="status">
      <Suspense fallback={<div className="min-h-[60vh]" aria-hidden />}>
        <WithChecks />
      </Suspense>
    </PageShell>
  );
}

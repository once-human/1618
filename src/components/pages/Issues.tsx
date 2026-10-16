"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Issue } from "@/lib/presence/issues";
import { fmtNum } from "@/lib/time";
import { RangeView } from "@/components/history/RangeView";

/** Every month, newest first. */
export function IssueList() {
  const [list, setList] = useState<{ month: string; label: string; complete: boolean; plays: number }[] | null>(null);
  useEffect(() => {
    fetch("/api/issues")
      .then((r) => r.json())
      .then(setList)
      .catch(() => setList([]));
  }, []);
  if (!list) return <div className="min-h-[30vh]" aria-hidden />;
  return (
    <ol>
      {list.map((i) => (
        <li key={i.month}>
          <Link
            href={`/issues/${i.month}`}
            transitionTypes={["nav-forward"]}
            className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-t border-ink py-3 hover:bg-ink/[0.03] md:grid-cols-[1fr_1fr_auto]"
          >
            <span className="text-[clamp(1.5rem,3vw,2.25rem)] leading-tight font-semibold tracking-tight">{i.label}</span>
            <span className="hidden text-quiet md:block">{i.complete ? "" : "in progress"}</span>
            <span className="tnum text-quiet">{i.plays ? `${fmtNum(i.plays)} plays` : ""}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** One month, as an issue. */
export function IssueView({ month }: { month: string }) {
  const [issue, setIssue] = useState<Issue | null | undefined>(undefined);
  useEffect(() => {
    fetch(`/api/issues/${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setIssue)
      .catch(() => setIssue(null));
  }, [month]);
  if (issue === undefined) return <div className="min-h-[40vh]" aria-hidden />;
  if (!issue) return <p className="border-t border-ink pt-1.5 text-quiet">Nothing stored for this month.</p>;
  return (
    <div>
      <div className="mb-12 flex flex-wrap items-baseline justify-between gap-4 border-t border-ink pt-1.5">
        <h2 className="text-[clamp(2rem,6vw,4.5rem)] leading-none font-semibold tracking-tight">{issue.label}</h2>
        <p className="text-quiet">{issue.complete ? "The month, as it happened." : "So far. This issue fills in as the month goes."}</p>
      </div>
      <RangeView s={issue.summary} />
      <p className="mt-16 border-t border-ink pt-1.5">
        <Link href="/issues" transitionTypes={["nav-back"]} className="hover:underline">
          ← Every issue
        </Link>
      </p>
    </div>
  );
}

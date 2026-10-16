import type { Metadata } from "next";
import { PageShell } from "@/components/pages/PageShell";
import { IssueView } from "@/components/pages/Issues";
import { monthLabel } from "@/lib/presence/issues";

type Params = { month: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { month } = await params;
  const label = /^\d{4}-\d{2}$/.test(month) ? monthLabel(month) : "Issue";
  return { title: `${label}, Onkar Yaglewad`, alternates: { canonical: `/issues/${month}` } };
}

export function generateStaticParams(): Params[] {
  return [{ month: new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 7) }];
}

export default async function IssuePage({ params }: { params: Promise<Params> }) {
  const { month } = await params;
  return (
    <PageShell word="issue">
      <IssueView month={month} />
    </PageShell>
  );
}

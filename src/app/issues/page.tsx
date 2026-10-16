import type { Metadata } from "next";
import { PageShell } from "@/components/pages/PageShell";
import { IssueList } from "@/components/pages/Issues";

export const metadata: Metadata = {
  title: "Issues, Onkar Yaglewad",
  description: "A monthly issue of what I played, saved, built and ran. Written by the month itself.",
  alternates: { canonical: "/issues" },
};

export default function IssuesPage() {
  return (
    <PageShell word="issues">
      <p className="mb-12 max-w-[52ch] border-t border-ink pt-1.5 text-[17px] leading-snug">
        One issue a month, put together from everything the site keeps: the songs, the saves, the code, the runs. The
        current month fills in as it goes; once it&apos;s over, its issue stays as it was.
      </p>
      <IssueList />
    </PageShell>
  );
}

import type { Metadata } from "next";
import { PageShell } from "@/components/pages/PageShell";
import { NowPage } from "@/components/pages/Now";

export const metadata: Metadata = {
  title: "Now, Onkar Yaglewad",
  description: "What I'm up to right now. Most of it writes itself.",
  alternates: { canonical: "/now" },
};

export default function Now() {
  return (
    <PageShell word="now">
      <NowPage />
    </PageShell>
  );
}

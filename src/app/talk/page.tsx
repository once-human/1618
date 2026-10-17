import type { Metadata } from "next";
import { PageShell } from "@/components/pages/PageShell";
import { Talk } from "@/components/home/Talk";

export const metadata: Metadata = {
  title: "Talk, Onkar Yaglewad",
  description: "Write to me from here. I reply right on this page.",
  alternates: { canonical: "/talk" },
};

export default function TalkPage() {
  return (
    <PageShell word="talk">
      <div className="max-w-[900px]">
        <Talk page />
      </div>
    </PageShell>
  );
}

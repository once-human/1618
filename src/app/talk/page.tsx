import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { PageShell } from "@/components/pages/PageShell";
import { Talk } from "@/components/home/Talk";

export const metadata: Metadata = pageMeta("Talk", "Write to me from here. I reply right on this page.", "/talk");

export default function TalkPage() {
  return (
    <PageShell word="talk">
      <div className="max-w-[900px]">
        <Talk page />
      </div>
    </PageShell>
  );
}

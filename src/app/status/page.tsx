import type { Metadata } from "next";
import { PageShell } from "@/components/pages/PageShell";
import { StatusPage } from "@/components/pages/Status";

export const metadata: Metadata = {
  title: "Status, Onkar Yaglewad",
  description: "Everything this site does, where to find it, and whether it's working right now.",
  alternates: { canonical: "/status" },
};

export default function Status() {
  return (
    <PageShell word="status">
      <StatusPage />
    </PageShell>
  );
}

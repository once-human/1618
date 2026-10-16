import type { Metadata } from "next";
import { PageShell } from "@/components/pages/PageShell";
import { StatusPage } from "@/components/pages/Status";

export const metadata: Metadata = {
  title: "Status, Onkar Yaglewad",
  description: "Every live source behind this site, and whether it's answering.",
  alternates: { canonical: "/status" },
};

export default function Status() {
  return (
    <PageShell word="status">
      <StatusPage />
    </PageShell>
  );
}

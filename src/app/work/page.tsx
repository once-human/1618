import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { WorkList } from "@/components/home/WorkList";
import { PageTransition } from "@/components/site/PageTransition";

export const metadata: Metadata = pageMeta("Work", "Everything Onkar Yaglewad has been making, as a plain list.", "/work");

export default function WorkIndex() {
  return (
    <>
      <Nav />
      <PageTransition>
        <main className="px-4 pt-24 pb-32">
          <h1 className="bigword mb-10 -ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]">work</h1>
          <WorkList />
        </main>
      </PageTransition>
      <Footer />
    </>
  );
}

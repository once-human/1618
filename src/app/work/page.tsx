import type { Metadata } from "next";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { WorkList } from "@/components/home/WorkList";

export const metadata: Metadata = {
  title: "Work, Onkar Yaglewad",
  description: "Everything Onkar Yaglewad has been making, as a plain list.",
};

export default function WorkIndex() {
  return (
    <>
      <Nav />
      <main className="px-4 pt-24 pb-32">
        <h1 className="bigword mb-10 -ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]">work</h1>
        <WorkList />
      </main>
      <Footer />
    </>
  );
}

import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { PageTransition } from "@/components/site/PageTransition";

/** The frame every inner page shares: nav, the giant word, the page, the footer. */
export function PageShell({ word, children }: { word: string; children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <PageTransition>
        <main className="px-4 pt-24 pb-32">
          <h1 className="bigword mb-10 -ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]">{word}</h1>
          {children}
        </main>
      </PageTransition>
      <Footer />
    </>
  );
}

"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CHAPTERS, hm } from "@/content/story";
import { setClock } from "@/lib/clock";
import { SmoothScroll } from "@/components/scroll/SmoothScroll";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { BigWord } from "@/components/site/BigWord";
import { Hero } from "@/components/home/Hero";
import { DayChapter } from "@/components/home/DayChapter";
import { WorkList } from "@/components/home/WorkList";
import { Listening } from "@/components/home/Listening";
import { SayHi } from "@/components/home/SayHi";
import { Saved } from "@/components/home/Saved";
import { Timeline } from "@/components/home/Timeline";
import { StatusLine } from "@/components/live/StatusLine";
import { Label } from "@/components/site/Label";
import { PageTransition } from "@/components/site/PageTransition";

gsap.registerPlugin(ScrollTrigger);

/**
 * The whole day on one page. Scroll drives three things and nothing else:
 * photographs drift at slightly different speeds, the giant words slide
 * sideways, and the clock in the nav follows the day.
 */
export function Experience() {
  useEffect(() => {
    const mm = gsap.matchMedia();

    // The clock runs regardless of motion preference: it's information.
    const clockTriggers = gsap.utils.toArray<HTMLElement>("[data-clock]").map((el) => {
      const key = el.dataset.clock!;
      const [from, to] =
        key === "hero"
          ? [hm(6, 59), hm(6, 59)]
          : key === "end"
            ? [hm(22), hm(22)]
            : key.split("-").map(Number);
      return ScrollTrigger.create({
        trigger: el,
        start: "top center",
        end: "bottom center",
        onUpdate: (self) => setClock(from + (to - from) * self.progress),
        onEnter: () => setClock(from),
        onEnterBack: () => setClock(to),
      });
    });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.utils.toArray<HTMLElement>("[data-speed]").forEach((el) => {
        const speed = Number(el.dataset.speed) || 0;
        if (!speed) return;
        gsap.fromTo(
          el,
          { y: () => speed * 120 },
          {
            y: () => -speed * 120,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
              invalidateOnRefresh: true,
            },
          },
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-drift]").forEach((el, i) => {
        const dir = i % 2 === 0 ? -1 : 1;
        gsap.fromTo(
          el,
          { xPercent: dir < 0 ? 8 : -4 },
          {
            xPercent: dir < 0 ? -4 : 8,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      });
    });

    return () => {
      clockTriggers.forEach((t) => t.kill());
      mm.revert();
    };
  }, []);

  return (
    <SmoothScroll>
      <Nav home />
      <PageTransition>
        <main className="pb-24">
          <Hero />
          {CHAPTERS.map((chapter) => (
            <DayChapter key={chapter.id} chapter={chapter} />
          ))}

          <section
            id="work"
            data-clock="end"
            aria-labelledby="work-title"
            className="px-4 pt-[18vh]"
          >
            <BigWord
              as="h2"
              word="work"
              className="mb-10 -ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]"
            />
            <span id="work-title" className="sr-only">
              Work
            </span>
            <WorkList />
          </section>

          <section id="lately" aria-labelledby="lately-title" className="px-4 pt-[18vh]">
            <BigWord
              as="h2"
              word="lately"
              className="mb-10 -ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]"
            />
            <span id="lately-title" className="sr-only">
              Right now and the last 48 hours
            </span>
            <Label note="updates on its own" className="!mt-0">
              Right now
            </Label>
            <StatusLine />
            <Label note="music, code, saves and runs, grouped as they happened">The last 48 hours</Label>
            <Timeline />
          </section>

          <section id="listening" aria-labelledby="listening-title" className="px-4 pt-[18vh]">
            <BigWord
              as="h2"
              word="listening"
              className="mb-10 -ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]"
            />
            <span id="listening-title" className="sr-only">
              Listening
            </span>
            <Listening />
          </section>

          <section id="saved" aria-labelledby="saved-title" className="px-4 pt-[18vh]">
            <BigWord
              as="h2"
              word="saved"
              className="mb-10 -ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]"
            />
            <span id="saved-title" className="sr-only">
              Saved on Pinterest
            </span>
            <Saved />
          </section>

          <section id="say-hi" aria-labelledby="say-hi-title" className="px-4 pt-[18vh] pb-[14vh]">
            <BigWord
              as="h2"
              word="say hi"
              className="mb-10 -ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]"
            />
            <span id="say-hi-title" className="sr-only">
              Say hi
            </span>
            <SayHi />
          </section>
        </main>
      </PageTransition>
      <Footer />
    </SmoothScroll>
  );
}

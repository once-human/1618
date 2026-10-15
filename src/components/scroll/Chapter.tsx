"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Plate } from "@/components/scroll/Plate";
import { setGrade } from "@/components/scroll/Grade";
import { setClock } from "@/lib/clock";
import type { Chapter as ChapterData } from "@/content/story";

gsap.registerPlugin(ScrollTrigger);

/**
 * One pinned chapter. Its lines fade through one at a time as you scroll,
 * the plate eases in slowly, and the page clock + colour grade follow.
 *
 * With reduced motion there is no pinning or fading: the plate and all lines
 * simply stack and read as normal content.
 */
export function Chapter({ chapter, index }: { chapter: ChapterData; index: number }) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const beats = gsap.utils.toArray<HTMLElement>("[data-beat]", el);
      const plate = el.querySelector("[data-plate]");
      const n = beats.length;

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
          onEnter: () => setGrade(chapter.grade),
          onEnterBack: () => setGrade(chapter.grade),
          onUpdate: (self) =>
            setClock(chapter.startMin + (chapter.endMin - chapter.startMin) * self.progress),
        },
      });

      if (plate) tl.fromTo(plate, { scale: 1.07 }, { scale: 1, duration: n }, 0);

      beats.forEach((beat, i) => {
        tl.fromTo(beat, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.3 }, i + 0.05);
        if (i < n - 1) tl.to(beat, { autoAlpha: 0, y: -28, duration: 0.25 }, i + 0.72);
      });

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    });

    return () => mm.revert();
  }, [chapter]);

  return (
    <section
      ref={root}
      id={chapter.id}
      aria-label={chapter.title}
      style={{ "--h": `${chapter.screens * 100}vh` } as React.CSSProperties}
      className="relative h-[var(--h)] motion-reduce:h-auto motion-reduce:py-24"
    >
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center gap-8 px-5 motion-reduce:static motion-reduce:h-auto">
        <Plate chapter={chapter} index={index} />
        <div className="relative h-32 w-[min(90vw,780px)] sm:h-28 motion-reduce:h-auto">
          {chapter.beats.map((line) => (
            <p
              key={line}
              data-beat
              className="absolute inset-0 text-balance text-center text-xl font-light leading-snug tracking-tight text-foreground opacity-0 sm:text-2xl md:text-[1.7rem] motion-reduce:static motion-reduce:mb-6 motion-reduce:opacity-100"
            >
              {line}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { INTRO } from "@/content/story";
import { setClock } from "@/lib/clock";

gsap.registerPlugin(ScrollTrigger);

/** Title card: a quiet 06:59 and the name. Scrolling "wakes" the day. */
export function Intro() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "bottom top",
          scrub: 0.5,
          onUpdate: (self) => setClock(6 * 60 + 59 + self.progress),
        },
      });
      tl.to("[data-intro-clock]", { scale: 1.15, opacity: 0, duration: 1 }, 0).to(
        "[data-intro-rest]",
        { y: -40, opacity: 0, duration: 0.7 },
        0,
      );
      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    });
    return () => mm.revert();
  }, []);

  return (
    <section
      ref={root}
      aria-label="Introduction"
      className="relative flex h-screen flex-col items-center justify-center px-5 text-center"
    >
      <p
        data-intro-clock
        className="font-mono text-[clamp(4.5rem,16vw,12rem)] font-extralight leading-none tracking-tight tabular-nums text-foreground/90"
      >
        {INTRO.clock}
      </p>
      <div data-intro-rest className="mt-10 space-y-2">
        <h1 className="text-lg font-medium tracking-tight sm:text-xl">{INTRO.name}</h1>
        <p className="text-sm text-muted">{INTRO.line}</p>
      </div>
      <p
        data-intro-rest
        className="absolute bottom-10 font-mono text-xs uppercase tracking-[0.2em] text-muted"
      >
        {INTRO.hint}
      </p>
    </section>
  );
}

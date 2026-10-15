"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { COUNTER } from "@/content/story";
import { projects } from "@/content/projects";
import { profile } from "@/content/profile";
import { setGrade } from "@/components/scroll/Grade";
import { setClock } from "@/lib/clock";

gsap.registerPlugin(ScrollTrigger);

type Mode = "work" | "contact" | null;

const TILE: React.CSSProperties = {
  backgroundColor: "#27463d",
  backgroundImage:
    "linear-gradient(rgba(240,236,226,.55) 2px, transparent 2px), linear-gradient(90deg, rgba(240,236,226,.55) 2px, transparent 2px)",
  backgroundSize: "112px 112px",
};

/**
 * The finale: a flat-lay kitchen counter. The bag opens into the projects,
 * the glass holds contact. This is a drawn stand-in; the photoreal,
 * head-tracked counter replaces the art later but keeps the same interactions.
 */
export function Counter() {
  const root = useRef<HTMLElement>(null);
  const cards = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<Mode>(null);

  // Scroll choreography: reveal the counter, then the lines, then the objects.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const surface = el.querySelector("[data-surface]");
      const lines = gsap.utils.toArray<HTMLElement>("[data-line]", el);
      const objects = gsap.utils.toArray<HTMLElement>("[data-object]", el);
      gsap.set(objects, { autoAlpha: 0, y: 30 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
          onEnter: () => setGrade(COUNTER.grade),
          onEnterBack: () => setGrade(COUNTER.grade),
          onUpdate: (self) => setClock(COUNTER.startMin + 60 * self.progress),
        },
      });
      if (surface) tl.fromTo(surface, { opacity: 0 }, { opacity: 1, duration: 0.8 }, 0);
      tl.fromTo(lines[0], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.4);
      tl.fromTo(lines[1], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 1.0);
      tl.to(objects, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.15 }, 1.0);

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    });
    return () => mm.revert();
  }, []);

  // Cards rise out of the bag when it opens.
  useEffect(() => {
    if (mode !== "work" || !cards.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(cards.current!.children, {
        y: 90,
        scale: 0.82,
        rotate: (i) => (i % 2 ? 3 : -3),
        autoAlpha: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.07,
      });
    });
    return () => mm.revert();
  }, [mode]);

  // Escape closes; focus moves to the close button when an overlay opens.
  useEffect(() => {
    if (!mode) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMode(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const links = Object.entries(profile.links).filter(([, v]) => v) as [string, string][];

  return (
    <section
      ref={root}
      id={COUNTER.id}
      aria-label={COUNTER.title}
      className="relative h-[260vh] motion-reduce:h-auto"
    >
      <div className="sticky top-0 h-screen overflow-hidden motion-reduce:static motion-reduce:min-h-screen">
        {/* Counter surface */}
        <div
          data-surface
          aria-hidden
          className="absolute inset-0"
          style={{ ...TILE }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 60% at 50% 45%, rgba(255,196,120,.38), transparent 70%), radial-gradient(120% 100% at 50% 50%, transparent 40%, rgba(0,0,0,.72))",
            }}
          />
        </div>

        {/* Lines */}
        <div className="absolute inset-x-0 top-[14vh] mx-auto w-[min(90vw,760px)] text-center">
          {COUNTER.lines.map((line) => (
            <p
              key={line}
              data-line
              className="mb-3 text-balance text-xl font-light leading-snug tracking-tight text-white sm:text-2xl md:text-[1.7rem]"
            >
              {line}
            </p>
          ))}
        </div>

        {/* Objects on the counter */}
        <div className="absolute inset-0 flex items-center justify-center gap-[min(10vw,140px)] pt-[18vh]">
          <button
            type="button"
            data-object
            onClick={() => setMode("work")}
            aria-haspopup="dialog"
            className="group relative outline-none"
          >
            <span className="sr-only">Open the bag: my projects</span>
            <svg
              viewBox="0 0 220 260"
              className="h-[min(38vh,300px)] w-auto drop-shadow-[0_30px_30px_rgba(0,0,0,0.55)] transition-transform duration-500 group-hover:-translate-y-2 group-hover:rotate-[-2deg] group-focus-visible:-translate-y-2"
              aria-hidden
            >
              <path
                d="M70 84 C70 20 150 20 150 84"
                fill="none"
                stroke="#b9a47c"
                strokeWidth="9"
                strokeLinecap="round"
              />
              <rect x="22" y="76" width="176" height="170" rx="6" fill="#dccaa3" />
              <rect x="22" y="76" width="176" height="26" rx="6" fill="#cdb98f" />
              <text
                x="110"
                y="168"
                textAnchor="middle"
                fontFamily="var(--font-geist-mono), monospace"
                fontSize="17"
                letterSpacing="4"
                fill="#2b2418"
              >
                PROJECTS
              </text>
              <text
                x="110"
                y="192"
                textAnchor="middle"
                fontFamily="var(--font-geist-mono), monospace"
                fontSize="10"
                letterSpacing="3"
                fill="#5b4d36"
              >
                OPEN ME
              </text>
            </svg>
          </button>

          <button
            type="button"
            data-object
            onClick={() => setMode("contact")}
            aria-haspopup="dialog"
            className="group relative outline-none"
          >
            <span className="sr-only">Pick up the glass: contact</span>
            <svg
              viewBox="0 0 200 200"
              className="h-[min(24vh,190px)] w-auto drop-shadow-[0_24px_24px_rgba(0,0,0,0.5)] transition-transform duration-500 group-hover:scale-105 group-focus-visible:scale-105"
              aria-hidden
            >
              <circle cx="100" cy="100" r="84" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.55)" strokeWidth="3" />
              <circle cx="100" cy="100" r="68" fill="rgba(255,150,90,.5)" />
              <circle cx="100" cy="100" r="68" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2" />
              <circle cx="78" cy="82" r="9" fill="rgba(255,255,255,.35)" />
              <text
                x="100"
                y="108"
                textAnchor="middle"
                fontFamily="var(--font-geist-mono), monospace"
                fontSize="13"
                letterSpacing="4"
                fill="#1b130c"
              >
                SAY HI
              </text>
            </svg>
          </button>
        </div>

        <p className="absolute inset-x-0 bottom-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
          <Link href="/work" className="underline-offset-4 hover:text-white hover:underline">
            Or see all work as a list
          </Link>
        </p>

        {/* Overlay: projects or contact */}
        {mode && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={mode === "work" ? "Projects" : "Contact"}
            className="absolute inset-0 z-20 overflow-y-auto bg-black/70 backdrop-blur-md"
            onClick={(e) => e.target === e.currentTarget && setMode(null)}
          >
            <button
              ref={closeBtn}
              type="button"
              onClick={() => setMode(null)}
              className="fixed right-5 top-12 z-30 rounded-full border border-white/25 px-4 py-1.5 font-mono text-xs text-white/80 transition-colors hover:bg-white/10 sm:right-8"
            >
              Close ✕
            </button>

            {mode === "work" ? (
              <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center px-5 py-24">
                <h2 className="mb-8 text-center font-mono text-xs uppercase tracking-[0.2em] text-white/55">
                  What I&apos;ve been making
                </h2>
                <div ref={cards} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.map((p) => (
                    <Link
                      key={p.slug}
                      href={`/work/${p.slug}`}
                      className="group flex min-h-48 flex-col justify-between rounded-md border border-white/15 bg-[#14120f]/90 p-5 transition-colors hover:border-white/45 hover:bg-[#1b1813]"
                    >
                      <div>
                        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200/70">
                          {p.status}
                        </p>
                        <h3 className="text-xl font-medium tracking-tight text-white">{p.name}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-white/60">{p.tagline}</p>
                      </div>
                      <span className="mt-5 font-mono text-xs text-white/45 transition-colors group-hover:text-white">
                        Read the case →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-5 py-24 text-center">
                <h2 className="text-2xl font-light tracking-tight text-white">Say hi.</h2>
                <p className="mt-3 text-sm text-white/60">
                  I&apos;m always up for talking about products, communities, or good coffee.
                </p>
                <ul className="mt-8 space-y-3 font-mono text-sm">
                  {links.map(([key, href]) => (
                    <li key={key}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-200/90 underline-offset-4 hover:underline"
                      >
                        {key === "x" ? "X" : key[0].toUpperCase() + key.slice(1)} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

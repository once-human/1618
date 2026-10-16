import { HERO } from "@/content/story";
import { BigWord } from "@/components/site/BigWord";
import { Frame } from "@/components/site/Frame";

/** Photographs on a loose grid, the name running across them, one line of who. */
export function Hero() {
  return (
    <section id="top" data-clock="hero" aria-label="Introduction" className="relative min-h-svh px-4 pt-20 pb-28">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {HERO.frames.map((f) => (
          <Frame key={f.caption} frame={f} />
        ))}
      </div>

      <BigWord
        as="h1"
        word={HERO.word}
        marquee
        className="pointer-events-none absolute inset-x-0 top-[38svh] z-10 text-[clamp(7rem,24vw,24rem)]"
      />

      <p className="mt-16 max-w-[34ch] text-[17px] leading-snug md:mt-24">{HERO.line}</p>
    </section>
  );
}

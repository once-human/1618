import type { Chapter } from "@/content/story";

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.55'/></svg>\")";

/**
 * The picture slot for a chapter. Until real frames exist it renders a
 * graded, grainy "plate" carrying the written shot brief, so the film's pacing,
 * copy and structure can be judged before any image is generated.
 */
export function Plate({ chapter, index }: { chapter: Chapter; index: number }) {
  // TODO(frames): when chapter.frameCount is set, render a canvas scrubber here
  // (see components/scroll/FrameSequence.tsx) instead of the placeholder plate.
  const n = String(index + 1).padStart(2, "0");
  return (
    <div
      data-plate
      className="relative aspect-video w-[min(90vw,1180px)] overflow-hidden rounded-[3px] border border-white/10 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)]"
      style={{ background: "radial-gradient(90% 80% at 50% 35%, var(--g1), transparent 75%)" }}
    >
      <div
        className="absolute inset-0 opacity-[0.16] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
        aria-hidden
      />
      <div className="absolute inset-x-0 top-0 h-[7%] bg-black/70" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-[7%] bg-black/70" aria-hidden />
      <div className="absolute inset-0 flex flex-col justify-between p-5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45 sm:p-8 sm:text-[11px]">
        <span>
          Plate {n} · {chapter.title}
        </span>
        <div className="max-w-xl space-y-2 normal-case tracking-normal text-white/55">
          <p>
            <span className="uppercase tracking-[0.18em] text-white/35">Shot </span>
            {chapter.brief.shot}
          </p>
          <p>
            <span className="uppercase tracking-[0.18em] text-white/35">Mood </span>
            {chapter.brief.mood}
          </p>
        </div>
      </div>
    </div>
  );
}

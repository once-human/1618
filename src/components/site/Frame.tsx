import type { Frame as FrameData } from "@/content/story";

const RATIO: Record<FrameData["aspect"], string> = {
  portrait: "aspect-[4/5]",
  landscape: "aspect-[3/2]",
  square: "aspect-square",
};

/**
 * A photograph slot on the loose four-column grid. Until the photo exists it's
 * a flat tone close to the real picture's colour, with the caption saying what
 * it will be. Placement only applies from md up; on phones frames stack in two
 * columns.
 */
export function Frame({ frame, className = "" }: { frame: FrameData; className?: string }) {
  const span = frame.span ?? 1;
  const wide = frame.aspect === "landscape" || span === 2;

  return (
    <figure
      data-speed={frame.speed ?? 0}
      style={
        {
          "--c": `${frame.col} / span ${span}`,
          "--d": `${frame.drop ?? 0}rem`,
        } as React.CSSProperties
      }
      className={`${wide ? "col-span-2" : "col-span-1"} md:[grid-column:var(--c)] md:[margin-top:var(--d)] ${className}`}
    >
      <div
        role="img"
        aria-label={`Photograph to come: ${frame.caption}`}
        className={`${RATIO[frame.aspect]} w-full`}
        style={{ backgroundColor: frame.tone }}
      />
      <figcaption className="mt-1.5 text-[12px] leading-snug text-quiet">{frame.caption}</figcaption>
    </figure>
  );
}

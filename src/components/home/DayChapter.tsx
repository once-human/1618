import type { Chapter } from "@/content/story";
import { BigWord } from "@/components/site/BigWord";
import { Frame } from "@/components/site/Frame";
import { formatClock } from "@/lib/clock";

/** First desktop column that no frame occupies; the text sits there. */
function freeColumn(chapter: Chapter): number {
  const taken = new Set<number>();
  for (const f of chapter.frames) for (let c = f.col; c < f.col + (f.span ?? 1); c++) taken.add(c);
  return [1, 2, 3, 4].find((c) => !taken.has(c)) ?? 1;
}

/**
 * One part of the day: a giant word that drifts as you pass, the time, a few
 * plain sentences, and the photographs placed loosely around them.
 */
export function DayChapter({ chapter }: { chapter: Chapter }) {
  const textCol = freeColumn(chapter);

  return (
    <section
      id={chapter.id}
      data-clock={`${chapter.startMin}-${chapter.endMin}`}
      aria-labelledby={`${chapter.id}-word`}
      className="relative px-4 pt-[18vh] pb-[10vh]"
    >
      <div id={`${chapter.id}-word`}>
        <BigWord as="h2" word={chapter.word} className="-ml-[0.04em] text-[clamp(4.5rem,17vw,17rem)]" />
      </div>

      <div className="mt-8 grid grid-cols-2 items-start gap-4 md:mt-12 md:grid-cols-4">
        <div
          style={{ "--c": `${textCol} / span 1` } as React.CSSProperties}
          className="col-span-2 md:col-span-1 md:[grid-column:var(--c)] md:row-start-1 [&>p:not(:first-child)]:max-w-[32ch]"
        >
          <p className="tnum border-t border-ink pt-1.5 font-semibold">
            {formatClock(chapter.startMin)}
          </p>
          {chapter.text.map((t) => (
            <p key={t} className="mt-3">
              {t}
            </p>
          ))}
        </div>
        {chapter.frames.map((f) => (
          <Frame key={f.caption} frame={f} className="md:row-start-1" />
        ))}
      </div>
    </section>
  );
}

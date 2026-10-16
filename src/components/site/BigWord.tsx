/**
 * The giant lowercase word. `marquee` runs it endlessly across the screen;
 * otherwise it drifts sideways as you scroll past (wired in Experience via
 * data-drift).
 */
export function BigWord({
  word,
  as: Tag = "p",
  marquee = false,
  className = "",
}: {
  word: string;
  as?: "p" | "h1" | "h2";
  marquee?: boolean;
  className?: string;
}) {
  if (marquee) {
    const run = Array.from({ length: 6 }, () => word).join(" ");
    return (
      <Tag className={`bigword overflow-hidden ${className}`} aria-label={word}>
        <span aria-hidden className="flex w-max animate-[marquee_38s_linear_infinite]">
          <span className="pr-[0.3em]">{run}</span>
          <span className="pr-[0.3em]">{run}</span>
        </span>
      </Tag>
    );
  }
  return (
    <Tag className={`bigword ${className}`}>
      <span data-drift className="inline-block will-change-transform">
        {word}
      </span>
    </Tag>
  );
}

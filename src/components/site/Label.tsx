/** A ruled label line that starts each part of a section, with an optional note on the right. */
export function Label({
  children,
  note,
  className = "",
  as: Heading = "h3",
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  /** The heading level, so headings never skip a level on the page they're on. */
  as?: "h2" | "h3";
}) {
  return (
    <div className={`mt-20 mb-6 flex items-baseline justify-between gap-4 border-t border-ink pt-1.5 ${className}`}>
      <Heading className="font-semibold">{children}</Heading>
      {note ? <span className="text-right text-quiet">{note}</span> : null}
    </div>
  );
}

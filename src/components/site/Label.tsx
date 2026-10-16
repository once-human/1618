/** A ruled label line that starts each part of a section, with an optional note on the right. */
export function Label({
  children,
  note,
  className = "",
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mt-20 mb-6 flex items-baseline justify-between gap-4 border-t border-ink pt-1.5 first:mt-0 ${className}`}>
      <h3 className="font-semibold">{children}</h3>
      {note ? <span className="text-right text-quiet">{note}</span> : null}
    </div>
  );
}

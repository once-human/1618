/**
 * A tiny three-bar level meter: the one sign that something is playing right
 * now. Bars stand still for anyone who prefers reduced motion.
 */
export function Playing({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-flex h-[0.8em] items-end gap-[2px] ${className}`}>
      {[0, 0.25, 0.5].map((delay) => (
        <span
          key={delay}
          className="h-full w-[2px] origin-bottom animate-[eq_0.9s_ease-in-out_infinite] bg-current"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

import { artSet } from "@/lib/art";

/** A square cover at a fixed on-screen size, sharp at any pixel density. */
export function Cover({
  url,
  px,
  alt = "",
  className = "",
  eager = false,
}: {
  url: string | null;
  px: number;
  alt?: string;
  className?: string;
  eager?: boolean;
}) {
  if (!url) return <span aria-hidden className={`block aspect-square bg-[#e6e6e6] ${className}`} style={{ width: px }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...artSet(url, px)}
      alt={alt}
      width={px}
      height={px}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={`aspect-square shrink-0 bg-[#e6e6e6] object-cover ${className}`}
      style={{ width: px }}
    />
  );
}

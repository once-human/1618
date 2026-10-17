/**
 * Album covers at the right size for the screen. Apple's and Deezer's image
 * servers make any size on request, so each cover lists 1×, 2× and 3×
 * versions of its on-screen size and the browser picks the one that matches
 * the display: sharp on a big retina screen, light on a cheap phone.
 */
const APPLE = /\/\d+x\d+bb\.(jpg|png|webp)$/;
const DEEZER = /\/(\d+)x\1-/;

export function artUrl(url: string, px: number): string {
  const n = Math.min(1200, Math.round(px));
  // Apple also serves WebP: about half the bytes from ~160px up (smaller than that, JPEG wins).
  if (APPLE.test(url)) return url.replace(APPLE, `/${n}x${n}bb.${n >= 160 ? "webp" : "jpg"}`);
  if (DEEZER.test(url)) return url.replace(DEEZER, `/${n}x${n}-`);
  return url;
}

/** src + srcSet for a cover shown at `px` CSS pixels. */
export function artSet(url: string | null, px: number): { src?: string; srcSet?: string } {
  if (!url) return {};
  if (!APPLE.test(url) && !DEEZER.test(url)) return { src: url };
  return {
    src: artUrl(url, px * 2),
    srcSet: [1, 2, 3].map((d) => `${artUrl(url, px * d)} ${d}x`).join(", "),
  };
}

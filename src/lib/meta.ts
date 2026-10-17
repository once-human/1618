import type { Metadata } from "next";

/**
 * A page's title and description, everywhere they're read: the tab, search
 * results, and the card when the link is shared (Open Graph and X). Each page
 * keeps its own preview image (its opengraph-image file).
 */
export function pageMeta(title: string, description: string, path: string): Metadata {
  const full = `${title}, Onkar Yaglewad`;
  return {
    title: full,
    description,
    alternates: { canonical: path },
    openGraph: { title: full, description, url: path, type: "website", siteName: "Onkar Yaglewad", locale: "en_IN" },
    twitter: { card: "summary_large_image", title: full, description },
  };
}

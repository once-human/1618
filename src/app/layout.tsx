import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { profile } from "@/content/profile";
import { CommandMenu } from "@/components/site/CommandMenu";
import { HereKeeper } from "@/components/site/HereKeeper";
import { TalkNotice } from "@/components/site/TalkNotice";
import { PlayedYourSong } from "@/components/site/PlayedYourSong";
import { SiteOnly } from "@/components/site/SiteOnly";
import { SeedLive } from "@/components/site/SeedLive";

const description =
  "Onkar Yaglewad builds consumer products end to end, from the first idea to the last pixel. This is one ordinary day.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Onkar Yaglewad",
  description,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Onkar Yaglewad",
    title: "Onkar Yaglewad",
    description,
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: "Onkar Yaglewad", description },
};

/**
 * Archivo, served with the page: preloaded, and with a fallback sized to
 * match it exactly, so text doesn't reflow (and the page doesn't jump) when
 * the real font arrives. Weight 100-900 and width 62-125%, one file.
 */
const archivo = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  adjustFontFallback: "Arial",
});

/** Who this site is about, for search engines (schema.org). */
const identity = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${SITE_URL}/#me`,
      name: profile.name,
      url: SITE_URL,
      jobTitle: profile.role,
      description,
      address: { "@type": "PostalAddress", addressLocality: profile.city, addressCountry: "IN" },
      sameAs: Object.values(profile.links).filter((l): l is string => !!l && l.startsWith("http")),
    },
    { "@type": "WebSite", "@id": `${SITE_URL}/#site`, url: SITE_URL, name: profile.name, inLanguage: "en-IN", publisher: { "@id": `${SITE_URL}/#me` } },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={archivo.variable}>
      <head>
        {/* Album covers and pins come from these image CDNs; open the connections early. */}
        <link rel="preconnect" href="https://is1-ssl.mzstatic.com" />
        <link rel="preconnect" href="https://i.pinimg.com" />
        {/* Song previews stream from here, only when someone presses play. */}
        <link rel="dns-prefetch" href="https://audio-ssl.itunes.apple.com" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(identity) }} />
      </head>
      <body>
        {/* Live data rides along with the page (streamed in, never holding it up). */}
        <Suspense fallback={null}>
          <SeedLive />
        </Suspense>
        {children}
        <SiteOnly>
          <CommandMenu />
          <HereKeeper />
          <TalkNotice />
          <PlayedYourSong />
        </SiteOnly>
      </body>
    </html>
  );
}

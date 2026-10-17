import type { Metadata } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { CommandMenu } from "@/components/site/CommandMenu";
import { HereKeeper } from "@/components/site/HereKeeper";
import { TalkNotice } from "@/components/site/TalkNotice";
import { PlayedYourSong } from "@/components/site/PlayedYourSong";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        {/* Album covers and pins come from these image CDNs; open the connections early. */}
        <link rel="preconnect" href="https://is1-ssl.mzstatic.com" />
        <link rel="preconnect" href="https://i.pinimg.com" />
        {/* Song previews stream from here, only when someone presses play. */}
        <link rel="dns-prefetch" href="https://audio-ssl.itunes.apple.com" />
      </head>
      <body>
        {children}
        <CommandMenu />
        <HereKeeper />
        <TalkNotice />
        <PlayedYourSong />
      </body>
    </html>
  );
}

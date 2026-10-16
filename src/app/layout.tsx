import type { Metadata } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Onkar Yaglewad",
  description:
    "Onkar Yaglewad builds consumer products end to end, from the first idea to the last pixel. This is one ordinary day.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

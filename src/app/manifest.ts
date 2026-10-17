import type { MetadataRoute } from "next";

/** For "Add to Home Screen" and the like: the name, the icon, the colours. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Onkar Yaglewad",
    short_name: "Onkar",
    description: "Onkar Yaglewad builds consumer products end to end. This is one ordinary day.",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

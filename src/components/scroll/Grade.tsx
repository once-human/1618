"use client";

import { gsap } from "gsap";

/**
 * Fixed full-screen colour grade that shifts with the time of day.
 * The colours live as CSS variables on <html> (defaults in globals.css) so
 * every descendant, including the chapter plates, can use them.
 */
export function Grade() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ background: "radial-gradient(120% 90% at 50% 40%, var(--g1), var(--g2) 70%)" }}
    />
  );
}

export function setGrade(grade: [string, string]) {
  gsap.to(document.documentElement, {
    "--g1": grade[0],
    "--g2": grade[1],
    duration: 1.4,
    ease: "power2.out",
    overwrite: "auto",
  });
}

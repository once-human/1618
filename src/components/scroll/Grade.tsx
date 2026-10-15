"use client";

import { gsap } from "gsap";

const ID = "grade";

/** Fixed full-screen colour grade that shifts with the time of day. */
export function Grade({ initial }: { initial: [string, string] }) {
  return (
    <div
      id={ID}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={
        {
          "--g1": initial[0],
          "--g2": initial[1],
          background: "radial-gradient(120% 90% at 50% 40%, var(--g1), var(--g2) 70%)",
        } as React.CSSProperties
      }
    />
  );
}

export function setGrade(grade: [string, string]) {
  gsap.to(`#${ID}`, {
    "--g1": grade[0],
    "--g2": grade[1],
    duration: 1.4,
    ease: "power2.out",
    overwrite: "auto",
  });
}

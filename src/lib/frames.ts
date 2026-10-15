/** Path to a single extracted frame. Frames are 1-indexed, zero-padded to 4 digits. */
export function frameUrl(sceneId: string, index: number): string {
  return `/frames/${sceneId}/${String(index).padStart(4, "0")}.webp`;
}

/** Whether the user asked the OS for reduced motion (client only). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

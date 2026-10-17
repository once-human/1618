/**
 * Scroll to a section by id. On the home page, Lenis (smooth scrolling) is
 * running and does it smoothly; anywhere else it's a plain jump. Kept apart
 * from SmoothScroll so the top bar and menu don't pull GSAP and Lenis into
 * every page.
 */
type Scroller = { scrollTo: (el: HTMLElement, opts: { duration: number }) => void };
let smooth: Scroller | null = null;

export function setSmoothScroller(s: Scroller | null) {
  smooth = s;
}

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (smooth) smooth.scrollTo(el, { duration: 2.4 });
  else el.scrollIntoView({ behavior: "auto" });
}

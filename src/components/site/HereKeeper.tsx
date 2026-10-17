"use client";

import { useHere } from "@/lib/presence/client";

/**
 * Keeps this tab counted as "here" on every page, not only the ones that show
 * the count, so moving around the site never looks like leaving it.
 */
export function HereKeeper() {
  useHere();
  return null;
}

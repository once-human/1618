"use client";

import { useEffect } from "react";
import { seedStores, type SeedData } from "@/lib/presence/client";

/**
 * Hands the page's live data (sent along with the HTML) to the browser-side
 * stores, so it shows the moment the page starts, with no extra round trip.
 * Renders nothing.
 */
let pending: (() => void)[] = [];
export function Seed(props: SeedData) {
  // Primed during render, so anything that reads a store right after sees the data.
  if (typeof window !== "undefined") pending.push(...seedStores(props));
  useEffect(() => {
    const run = pending;
    pending = [];
    run.forEach((f) => f());
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { startTracking, trackPage } from "@/lib/visits/client";

/** The visitor log's eyes: starts once, notes every page change. See /privacy. */
export function Tracker() {
  const path = usePathname();
  useEffect(() => {
    startTracking();
    trackPage(path);
  }, [path]);
  return null;
}

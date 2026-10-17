"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useHere } from "@/lib/presence/client";
import { pageChanged } from "@/lib/presence/here";
import { OthersRail } from "./OthersRail";

/**
 * Keeps this tab counted as "here" on every page, not only the ones that show
 * the count, so moving around the site never looks like leaving it. Also
 * tells the others when I move to another page, and shows where they are.
 */
export function HereKeeper() {
  useHere();
  const path = usePathname();
  useEffect(() => pageChanged(), [path]);
  return <OthersRail />;
}

import { connection } from "next/server";
import { snapshot } from "@/lib/seed";
import type { Live } from "@/lib/presence/types";
import { Seed } from "./Seed";

/** Presence and music, sent with every page (the footer and status lines use them everywhere). */
export async function SeedLive() {
  await connection();
  return <Seed live={await snapshot<Live>("/api/live", "live")} />;
}

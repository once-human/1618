/** Where "N people here" lives: a Supabase project used only for Realtime Presence. */
export const HERE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://dceiyqtvejyxzpvmcnuj.supabase.co";
/** A publishable key: meant for browsers, and the project stores no data. */
export const HERE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "sb_publishable_LHJMR1AVPMeQe6U9SeJqug_4ZYHUWsz";

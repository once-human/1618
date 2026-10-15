/**
 * "Always" signals for the living profile: true things that don't change
 * minute to minute. Shown separately from live data, never dressed up as live.
 */
export const ALWAYS = [
  { key: "Listening", value: "Fred again.., house, afro house, techno", hideWhenLive: "music" },
  { key: "Running", value: "Has run a marathon" },
  { key: "Coffee", value: "All day, not just mornings" },
  { key: "Community", value: "Ran PuneFOSS, 400+ people at its biggest" },
  { key: "Building", value: "Consumer products, end to end" },
] as const;

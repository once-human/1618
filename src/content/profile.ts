/**
 * Public identity + contact. Anything `null` is hidden from the site.
 * TODO(onkar): fill in the ones you want public. Nothing here is published
 * unless you set it.
 */
export const profile = {
  name: "Onkar Yaglewad",
  role: "Product engineer",
  city: "Pune",
  tagline: "I build consumer products end to end: idea, design, code, growth.",
  links: {
    github: "https://github.com/once-human" as string | null,
    pinterest: "https://www.pinterest.com/onkaryaglewad/" as string | null,
    email: null as string | null,
    linkedin: null as string | null,
    x: null as string | null,
    telegram: null as string | null,
  },
} as const;

const LABELS: Record<string, string> = {
  github: "GitHub",
  pinterest: "Pinterest",
  email: "Email",
  linkedin: "LinkedIn",
  x: "X",
  telegram: "Telegram",
};

/** Public links that are set, with display labels. */
export function publicLinks(): { label: string; href: string }[] {
  return Object.entries(profile.links)
    .filter((e): e is [string, string] => !!e[1])
    .map(([k, v]) => ({
      label: LABELS[k] ?? k,
      href: k === "email" && !v.startsWith("mailto:") ? `mailto:${v}` : v,
    }));
}

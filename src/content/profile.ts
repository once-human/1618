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
    email: null as string | null,
    linkedin: null as string | null,
    x: null as string | null,
    telegram: null as string | null,
  },
} as const;

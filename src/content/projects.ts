/**
 * Projects shown in the bag and on /work/[slug].
 * Every claim here comes from something Onkar told Claude. Where a fact is
 * unknown the page says so rather than guessing. See docs/CONTENT-VERIFY.md.
 */

export type ProjectStatus =
  | "Specced, shelved by choice"
  | "Prototype"
  | "Ongoing"
  | "Paused"
  | "In development";

export interface Project {
  slug: string;
  name: string;
  tagline: string;
  status: ProjectStatus;
  role: string;
  tags: string[];
  summary: string;
  sections: { heading: string; body: string[] }[];
  links: { label: string; href: string }[];
}

export const projects: Project[] = [
  {
    slug: "sahn",
    name: "SAHN",
    tagline: "A marketplace matching event organisers with vendors and free community venues.",
    status: "Specced, shelved by choice",
    role: "Product, system design, go-to-market",
    tags: ["Marketplace", "Product spec", "Systems design", "GTM"],
    summary:
      "A two-sided marketplace for events, planned for Pune first. I wrote a deep product and technical spec, then chose not to build it. That decision is part of the story.",
    sections: [
      {
        heading: "What it was",
        body: [
          "SAHN matched event organisers with vendors (catering, AV, photography, venues) and with free or in-kind community venues. Pune first, Bengaluru next.",
        ],
      },
      {
        heading: "How it was designed",
        body: [
          "The spec describes 16 named engines, including matching, fairness and exposure, cold-start handling, vendor reliability scoring, badges, review integrity, abuse detection, in-kind hosting, availability, pricing intelligence, demand forecasting, notifications and platform health.",
        ],
      },
      {
        heading: "Go-to-market",
        body: [
          "Launch with tech and design events in Pune only. Expand to Bengaluru once Pune has traction. Win Pune completely while growing Bengaluru, then add one or two more cities.",
          "Weddings were out of scope by design. General personal events such as birthdays were a planned later niche.",
        ],
      },
      {
        heading: "Why I stopped",
        body: [
          "Photography looked like a weak revenue category. At tech and design events it is usually volunteer work, and the premium paid end (₹20K and up) is already served by existing platforms. A marketplace that can't monetise one of its headline categories needs a different shape, so I dropped it and moved on rather than build it anyway.",
        ],
      },
    ],
    links: [],
  },
  {
    slug: "head-tracked-window",
    name: "Head-tracked window",
    tagline: "Lean around a photo in your browser. Webcam only, no special hardware.",
    status: "Prototype",
    role: "Design and engineering",
    tags: ["WebGL", "Computer vision", "Depth estimation", "Performance"],
    summary:
      "A test for this portfolio's finale: your screen behaves like glass above a kitchen counter. Move your head or tilt the laptop and the scene shifts the way a real window would.",
    sections: [
      {
        heading: "The idea",
        body: [
          "Webcam head tracking drives an off-axis projection, so the screen reads as a window onto the scene, not a flat picture. Left and right, up and down, and tilt all respond. Distance changes the depth feel, not the zoom.",
        ],
      },
      {
        heading: "How it works",
        body: [
          "One AI-generated overhead photo, with depth estimated offline using Depth Anything V2, rendered as a textured 3D mesh. I started with gaussian splats and switched to a mesh for performance.",
        ],
      },
      {
        heading: "The bar I held it to",
        body: [
          "Motion had to feel immediate and smooth, closer to physically moving a laptop than to a lagging effect. And resolution is never downscaled to buy performance: optimise never means lower quality.",
        ],
      },
    ],
    links: [
      { label: "Live prototype", href: "https://pfolio-headtrack-test.vercel.app" },
      { label: "Source", href: "https://github.com/once-human/pfolio-headtrack-test" },
    ],
  },
  {
    slug: "project-friday",
    name: "Project Friday",
    tagline: "Claude built into the desktop itself, not bolted on as a chat window.",
    status: "Prototype",
    role: "Product, design, engineering",
    tags: ["Linux", "Desktop", "AI", "Hyprland"],
    summary:
      "An exploration of what an AI-native desktop could feel like. The prototype is a Claude layer inside a Hyprland shell, reached from the Super-key search popup.",
    sections: [
      {
        heading: "The thinking",
        body: [
          "Starting as an OS would be the wrong first step, so Friday is a layer inside an existing shell first. It uses the person's own Claude account rather than an API key, so it is regular Claude, embedded deeply.",
        ],
      },
      {
        heading: "Principles",
        body: [
          "Premium and polished: blur, smooth motion, Claude-inspired UI. Near-zero resource use when idle. Simple tasks handled on-device so they don't spend usage. A free local model as a fallback, with no cloud and no internet needed.",
          "Everything is switchable from the terminal and every default is restorable. Linux only for now.",
        ],
      },
      {
        heading: "Status",
        body: ["Early prototype. The plan is a public release with a one-command installer across distros."],
      },
    ],
    links: [{ label: "Source", href: "https://github.com/once-human/project-friday" }],
  },
  {
    slug: "pixelos-sky",
    name: "PixelOS for sky",
    tagline: "Public, unofficial PixelOS builds for the Redmi 12 5G and POCO M6 Pro 5G.",
    status: "Ongoing",
    role: "ROM maintainer (learning)",
    tags: ["Android", "Custom ROM", "Open source"],
    summary:
      "I build and publish a custom Android ROM for a device I own. It started as curiosity, and I'm still learning the craft with help from people who know it well.",
    sections: [
      {
        heading: "What I ship",
        body: [
          "PixelOS 17 for the sky device, released publicly and built to be global-friendly: any region or firmware, easy to install, and unable to brick a phone.",
        ],
      },
      {
        heading: "How I work",
        body: [
          "I use the community's maintained sky device trees and get guidance from an experienced former PixelOS maintainer. I'm still early in ROM building, and I'd rather say so than pretend.",
        ],
      },
      {
        heading: "Where it's going",
        body: ["Monthly builds, with the aim of earning official status by maintaining unofficial builds first."],
      },
    ],
    links: [
      { label: "Source and docs", href: "https://github.com/once-human/pixelos-sky" },
      { label: "Downloads", href: "https://sourceforge.net/projects/pixelos-sky/" },
    ],
  },
  {
    slug: "punefoss",
    name: "PuneFOSS",
    tagline: "Free and open-source meetups for Pune's developer community.",
    status: "Paused",
    role: "Organiser",
    tags: ["Community", "Events", "Open source"],
    summary:
      "I organised FOSS United Pune meetups through PuneFOSS 4. It's the clearest example of building things that connect people, with no code involved.",
    sections: [
      {
        heading: "The numbers",
        body: [
          "PuneFOSS 3 drew over 400 attendees. PuneFOSS 4 sold about 165 tickets and about 100 people attended; some of those tickets went to community partners.",
        ],
      },
      {
        heading: "What I took from it",
        body: [
          "Four had a better venue than three but a smaller room. Venue helps, but it isn't the whole story. That gap is the thing I most want to understand before the next one.",
        ],
      },
      {
        heading: "What's next",
        body: [
          "I'm considering a restart with a new meetup, and planning PuneFOSS 5 for 2027. I'd also like a one-off collaboration with C-DAC Pune around BOSS Linux.",
        ],
      },
    ],
    links: [],
  },
  {
    slug: "still-breathing",
    name: "Still Breathing",
    tagline: "A dark, cinematic, distressed-tee label, and a goofy sister line, Split Lip.",
    status: "In development",
    role: "Brand, design, web",
    tags: ["Brand", "E-commerce", "Print-on-demand", "Web"],
    summary:
      "A clothing label built around raw and imperfect over soft and polished. It runs as an online side project on print-on-demand while I work on my own craft first.",
    sections: [
      {
        heading: "The brand",
        body: [
          "Dark, cinematic, distressed. Not Y2K, and not mythic. Raw, imperfect, a bit harsh, positioned against avant-garde labels.",
        ],
      },
      {
        heading: "Split Lip",
        body: [
          "A deliberately goofy sister line with a literal split lip as its graphic and its own separate Instagram. Hot-mess energy, English-first, flowy. The first capsule is tees and caps, and its site concept is a photo booth.",
        ],
      },
      {
        heading: "The site",
        body: [
          "A store that breaks clothing-site conventions (no typical cart drawer): cinematic and motion-heavy while staying easy to use, with a homepage that feels like it breathes.",
        ],
      },
    ],
    links: [],
  },
];

export const projectBySlug = (slug: string) => projects.find((p) => p.slug === slug);

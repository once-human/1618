/**
 * The narrative. One source of truth for copy, pacing, time of day, colour
 * grade, and the written shot brief for each (not yet generated) still.
 *
 * COPY STATUS: first draft written from facts Onkar has stated. Edit freely;
 * see docs/CONTENT-VERIFY.md for the claims to double check.
 */

export interface Chapter {
  id: string;
  /** Short title shown as a chapter label. */
  title: string;
  /** Clock minutes since midnight at the start / end of the chapter. */
  startMin: number;
  endMin: number;
  /** [centre glow, edge colour] of the page colour grade while in this chapter. */
  grade: [string, string];
  /** Lines that appear one at a time as you scroll. */
  beats: string[];
  /** Scroll length in viewport heights. */
  screens: number;
  /** Director's note standing in for the image until it's generated. */
  brief: {
    shot: string;
    mood: string;
  };
  /** Set once real frames exist in public/frames/<id>/ (see scripts/extract-frames.sh). */
  frameCount?: number;
}

export const hm = (h: number, m = 0) => h * 60 + m;

export const INTRO = {
  clock: "06:59",
  name: "Onkar Yaglewad",
  line: "Product engineer. Pune.",
  hint: "Scroll. It's a day.",
};

export const CHAPTERS: Chapter[] = [
  {
    id: "wake",
    title: "Morning",
    startMin: hm(7),
    endMin: hm(7, 40),
    grade: ["#3a2a1c", "#0d0b0a"],
    screens: 3.2,
    beats: [
      "I'm Onkar.",
      "I build consumer products from the first idea to the last pixel. Design, code, growth. I like owning the whole thing.",
      "Today's an ordinary day. Come along.",
    ],
    brief: {
      shot: "Overhead of a white bed, morning light through a window. Subject asleep, face partly hidden. He wakes, sits upright, camera drifts behind him into a third-person view.",
      mood: "Quiet, warm, slow. Soft dawn light. Nothing hurried.",
    },
  },
  {
    id: "door",
    title: "Threshold",
    startMin: hm(7, 40),
    endMin: hm(8, 50),
    grade: ["#2c2a2a", "#0b0b0c"],
    screens: 3.6,
    beats: [
      "Every project I've started began the same way: walking toward a door I hadn't opened yet.",
      "I'd rather build the whole thing myself than hand off one narrow slice of it.",
    ],
    brief: {
      shot: "Back-turned shot walking to a door; camera pushes in. The door opens and the world on the other side is a café. Outfit changes from waking clothes to day clothes during the step through.",
      mood: "Continuous, causal, no cuts. The riskiest shot in the film: prototype it first.",
    },
  },
  {
    id: "cafe",
    title: "Coffee",
    startMin: hm(9),
    endMin: hm(10, 30),
    grade: ["#4a3320", "#0e0b09"],
    screens: 3,
    beats: [
      "Coffee is an all-day thing for me. Mornings just get a head start.",
      "A good café is where most of my ideas get their first draft.",
    ],
    brief: {
      shot: "Café interior, window seat, a cup and a notebook on the table. Subject seen from behind or in profile, face obscured. Steam, warm window light.",
      mood: "Unhurried. Warm wood, window light, a little steam.",
    },
  },
  {
    id: "run",
    title: "Distance",
    startMin: hm(11),
    endMin: hm(12, 30),
    grade: ["#26343c", "#0a0c0e"],
    screens: 3.4,
    beats: [
      "I've run a marathon. Distance teaches you to pace, not sprint.",
      "I work the same way: long, uninterrupted stretches, and details until they're right.",
      "I'd rather ship it right than ship it twice.",
    ],
    brief: {
      shot: "Running through tall grass, tracked from behind, low sun. Café-to-run transition by motion blur, not a hard cut.",
      mood: "Open, cool daylight, forward motion. Breath and rhythm.",
    },
  },
  {
    id: "people",
    title: "People",
    startMin: hm(17),
    endMin: hm(18, 30),
    grade: ["#4d3a1f", "#0e0b08"],
    screens: 3,
    beats: [
      "I organised PuneFOSS, free and open-source meetups in Pune.",
      "PuneFOSS 3 had over 400 people in the room.",
      "I love building things that connect people. This was that, without code.",
    ],
    brief: {
      shot: "A community event at golden hour: a speaker at the front, a full room, phones up, laughter. Subject on stage seen from behind or side, face obscured.",
      mood: "Warm, social, a little loud after the quiet of the morning.",
    },
  },
  {
    id: "headphones",
    title: "Headphones",
    startMin: hm(20),
    endMin: hm(21),
    grade: ["#1d2040", "#07070d"],
    screens: 2.6,
    beats: [
      "Evenings are for music. House, afro house, techno, and Fred again.. on repeat.",
      "Then home. Time to make something with my hands.",
    ],
    brief: {
      shot: "Night walk home, headphones on, city lights soft and blurred, seen from behind. Cut to the apartment door.",
      mood: "Indigo dusk into night. The most cinematic stretch.",
    },
  },
];

export const COUNTER = {
  id: "counter",
  title: "The counter",
  startMin: hm(21),
  endMin: hm(22),
  grade: ["#4a3a22", "#0c0a07"] as [string, string],
  lines: [
    "I cook. I mix something. And I lay out what I've been making.",
    "Open the bag.",
  ],
  brief: {
    shot: "Eye-level at a warm-lit kitchen counter (green tiles, white grout), subject prepping a drink and food. Scroll rises to an overhead top view of the same counter, where the head-tracked depth effect turns on.",
    mood: "Photoreal crafting-table feel. Mint, limes, raspberries, a steel jigger, a pink ice tray, unbranded bottles.",
  },
};

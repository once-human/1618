/**
 * The day. One source of truth for copy, timing and the photographs each
 * chapter needs. Frames are empty until the photos are made: each one carries
 * a caption describing the picture it's waiting for (see docs/ASSET-BRIEFS.md).
 */

export type Aspect = "portrait" | "landscape" | "square";

export interface Frame {
  /** What the photograph will be. Shown as a small caption under the frame. */
  caption: string;
  /** Placeholder tone, close to the real photo's average colour. */
  tone: string;
  aspect: Aspect;
  /** Grid placement on desktop: start column (1-4) and span (1-2). */
  col: 1 | 2 | 3 | 4;
  span?: 1 | 2;
  /** Extra space above, in rem, for the loose contact-sheet rhythm. */
  drop?: number;
  /** Parallax: 0 is still, positive drifts up faster than the page. */
  speed?: number;
}

export interface Chapter {
  id: string;
  /** The giant word for this part of the day. Lowercase. */
  word: string;
  /** Clock minutes since midnight at the start and end of the chapter. */
  startMin: number;
  endMin: number;
  /** A short paragraph, in Onkar's voice. */
  text: string[];
  frames: Frame[];
  /** Set once real frames exist in public/frames/<id>/ (scripts/extract-frames.sh). */
  frameCount?: number;
}

export const hm = (h: number, m = 0) => h * 60 + m;

export const HERO = {
  word: "onkar",
  line: "Onkar Yaglewad builds consumer products end to end, from the first idea to the last pixel. This is one ordinary day.",
  frames: [
    { caption: "White sheets, first light", tone: "#d9d4cb", aspect: "portrait", col: 1, drop: 2, speed: 0.15 },
    { caption: "A café window, steam on the glass", tone: "#bca88f", aspect: "landscape", col: 2, drop: 9, speed: 0.3 },
    { caption: "Running through tall grass", tone: "#aeb7ad", aspect: "landscape", col: 3, drop: 4, speed: 0.1 },
    { caption: "A room full of people", tone: "#c4ad8a", aspect: "landscape", col: 4, drop: 12, speed: 0.25 },
  ] satisfies Frame[],
};

export const CHAPTERS: Chapter[] = [
  {
    id: "morning",
    word: "morning",
    startMin: hm(7),
    endMin: hm(7, 40),
    text: [
      "I'm Onkar. I build consumer products from the first idea to the last pixel: design, code and growth. I like owning the whole thing.",
    ],
    frames: [
      { caption: "Overhead, a white bed, morning light through the window", tone: "#dcd6cc", aspect: "landscape", col: 2, span: 2, speed: 0.1 },
      { caption: "Sitting up, seen from behind", tone: "#cfc8bd", aspect: "portrait", col: 4, drop: 10, speed: 0.3 },
    ],
  },
  {
    id: "door",
    word: "the door",
    startMin: hm(7, 40),
    endMin: hm(8, 50),
    text: [
      "Every project starts the same way for me: walking toward a door I haven't opened yet.",
      "I'd rather build the whole thing than hand off one narrow slice of it.",
    ],
    frames: [
      { caption: "Walking to the bedroom door, back to camera", tone: "#c7c2bb", aspect: "portrait", col: 1, drop: 6, speed: 0.25 },
      { caption: "The door opens onto a café", tone: "#b59c80", aspect: "landscape", col: 3, span: 2, speed: 0.05 },
    ],
  },
  {
    id: "coffee",
    word: "coffee",
    startMin: hm(9),
    endMin: hm(10, 30),
    text: ["Coffee is an all-day thing for me. Mornings just get a head start."],
    frames: [
      { caption: "Window seat, a cup and a notebook", tone: "#a88d72", aspect: "square", col: 2, speed: 0.2 },
      { caption: "Steam, warm wood, someone's hands", tone: "#8f7560", aspect: "portrait", col: 3, drop: 14, speed: 0.35 },
    ],
  },
  {
    id: "run",
    word: "distance",
    startMin: hm(11),
    endMin: hm(12, 30),
    text: [
      "I've run a marathon. Distance teaches you to pace, not sprint.",
      "I work the same way: long, uninterrupted stretches, and the details until they're right.",
    ],
    frames: [
      { caption: "Tall grass, low sun, tracked from behind", tone: "#a9b3a7", aspect: "landscape", col: 1, span: 2, speed: 0.1 },
      { caption: "Shoes on a dirt track", tone: "#b8b3a6", aspect: "portrait", col: 4, drop: 6, speed: 0.3 },
    ],
  },
  {
    id: "people",
    word: "people",
    startMin: hm(17),
    endMin: hm(18, 30),
    text: [
      "I organised PuneFOSS, free and open-source meetups in Pune. The biggest one had over 400 people in the room.",
      "I love building things that connect people. This was that, without any code.",
    ],
    frames: [
      { caption: "On stage at golden hour, seen from the side", tone: "#c2a57c", aspect: "portrait", col: 2, drop: 4, speed: 0.2 },
      { caption: "The crowd, phones up, laughing", tone: "#b39268", aspect: "landscape", col: 3, span: 2, drop: 16, speed: 0.05 },
    ],
  },
  {
    id: "headphones",
    word: "headphones",
    startMin: hm(20),
    endMin: hm(21),
    text: ["Evenings are for music: house, afro house, techno, and a lot of Fred again..", "Then home."],
    frames: [
      { caption: "Walking home at night, city lights blurred", tone: "#3e4152", aspect: "landscape", col: 1, span: 2, speed: 0.1 },
      { caption: "Headphones, streetlight, from behind", tone: "#2c2e3b", aspect: "portrait", col: 4, drop: 8, speed: 0.3 },
    ],
  },
  {
    id: "counter",
    word: "the counter",
    startMin: hm(21),
    endMin: hm(22),
    text: ["I cook, mix something to drink, and lay out what I've been making."],
    frames: [
      { caption: "Kitchen counter, green tiles, warm light", tone: "#5f6f5a", aspect: "landscape", col: 2, span: 2, speed: 0.1 },
      { caption: "Overhead: mint, limes, a steel jigger", tone: "#6d7a62", aspect: "square", col: 1, drop: 18, speed: 0.3 },
    ],
  },
];

/** Shown in "listening" when no live music source is connected. */
export const USUALLY_ON = ["Fred again..", "house", "afro house", "techno"];

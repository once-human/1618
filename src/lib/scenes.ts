/**
 * Single source of truth for the narrative.
 *
 * Each scene is one scroll-scrubbed frame sequence (Acts 1-3), except the
 * final "work" scene which hands off to Three.js. Frames live in
 * public/frames/<id>/ and are produced by scripts/extract-frames.sh.
 *
 * STATUS: placeholder list based on the brainstorm. Titles, order and frame
 * counts are drafts until the shot list is locked (see docs/STORYBOARD.md).
 */

export type SceneKind = "sequence" | "interactive";

export interface Scene {
  id: string;
  kind: SceneKind;
  /** Time shown in the header's time-of-day indicator while this scene is active. */
  time: string;
  /** Short caption that fades in when the scene settles. */
  caption: string;
  /** Number of extracted frames (sequence scenes only). */
  frameCount?: number;
  /** Scroll distance in viewport heights; controls pacing of the scene. */
  scrollScreens: number;
}

export const SCENES: Scene[] = [
  { id: "wake", kind: "sequence", time: "07:00", caption: "Morning.", frameCount: 120, scrollScreens: 3 },
  { id: "door", kind: "sequence", time: "07:40", caption: "Step outside.", frameCount: 150, scrollScreens: 4 },
  { id: "cafe", kind: "sequence", time: "09:00", caption: "Coffee first.", frameCount: 120, scrollScreens: 3 },
  { id: "run", kind: "sequence", time: "11:00", caption: "Then, move.", frameCount: 120, scrollScreens: 3 },
  { id: "event", kind: "sequence", time: "17:00", caption: "People.", frameCount: 120, scrollScreens: 3 },
  { id: "tabletop", kind: "interactive", time: "22:00", caption: "Make something.", scrollScreens: 5 },
];

/** Id of the section the "Skip to work" control jumps to. */
export const WORK_SCENE_ID = "tabletop";

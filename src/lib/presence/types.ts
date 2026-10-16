/** Everything the site knows about what Onkar is up to right now. All fields are real data or null. */
export interface Presence {
  /** Latest public GitHub activity. */
  github: {
    repo: string;
    url: string;
    action: string;
    message: string | null;
    at: string;
  } | null;
  /** Last push time per public repo, keyed by lowercase repo name. */
  repos: Record<string, string>;
  /** Current weather in Pune (Open-Meteo). */
  weather: {
    tempC: number;
    label: string;
  } | null;
  fetchedAt: string;
}

/**
 * Recent listening (Apple Music reaches Last.fm through a scrobbler app),
 * newest first, one row per song. Served by /api/music.
 */
export interface Music {
  /** Null unless LASTFM_USER + LASTFM_API_KEY are set. */
  tracks: Track[] | null;
  fetchedAt: string;
}

export interface Track {
  track: string;
  artist: string;
  album: string | null;
  /** The song on Apple Music (or an Apple Music search when there's no exact match). */
  url: string;
  image: string | null;
  /** True for the track playing right now. */
  nowPlaying: boolean;
  /** When it was played; null while it's still playing. */
  at: string | null;
}

/** My Pinterest: profile, boards, created pins and the latest saves. Served by /api/saved. */
export interface Saved {
  profile: PinterestProfile;
  /** Every public board, most recently updated first. */
  boards: PinterestBoard[];
  /** Pins I made myself (not saved from elsewhere). */
  created: SavedPin[];
  /** The latest saves, newest first. */
  pins: SavedPin[];
  fetchedAt: string;
}

export interface PinterestProfile {
  name: string;
  username: string;
  url: string;
  avatar: string | null;
  about: string | null;
  followers: number | null;
  following: number | null;
  /** Total pins, when Pinterest shares it. */
  pinCount: number | null;
}

export interface PinterestBoard {
  name: string;
  url: string;
  pinCount: number | null;
  cover: string | null;
  /** Placeholder colour while the cover loads. */
  color: string | null;
  /** When the board last changed, when known. */
  updated: string | null;
}

export interface SavedPin {
  id: string;
  url: string;
  /** 736px wide, for the grid on large screens. */
  image: string;
  /** 474px wide, for phones. */
  imageSmall: string;
  width: number;
  height: number;
  /** The image's dominant colour, shown while it loads. */
  color: string | null;
  title: string | null;
  board: string | null;
  boardUrl: string | null;
  /** When I saved it, when known. */
  at: string | null;
}

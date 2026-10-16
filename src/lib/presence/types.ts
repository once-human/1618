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

/** My latest Pinterest saves. Served by /api/saved. */
export interface Saved {
  profile: string;
  pins: SavedPin[];
  /** Boards I've saved to recently, newest first (derived from the pins above). */
  boards: SavedBoard[];
  fetchedAt: string;
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

export interface SavedBoard {
  name: string;
  url: string;
  /** How many of the recent saves went to this board. */
  recent: number;
  lastSaved: string | null;
}

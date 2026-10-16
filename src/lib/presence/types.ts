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

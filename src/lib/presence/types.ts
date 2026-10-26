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
  /** Where I am, roughly (city level), and its time zone. Pune unless I've said otherwise. */
  place: { city: string; tz: string };
  /** Current weather where I am (Open-Meteo). */
  weather: {
    tempC: number;
    label: string;
    /** Cloud cover, percent. */
    cloud?: number | null;
    rain?: boolean;
    /** Sunrise and sunset (ms), today and tomorrow, where I am. */
    sun?: { rise: number; set: number }[];
  } | null;
  /** A status I set myself from my phone, until it expires. */
  status: ManualStatus | null;
  /** "Hey Siri, good night": when I went to bed, for five hours after. */
  bedtime: Bedtime | null;
  /** Today's Apple Health numbers, if my Shortcut has sent them. */
  health: { steps: number | null; distanceKm: number | null; activeKcal: number | null; sleepHours: number | null; at: string } | null;
  fetchedAt: string;
}

export interface Bedtime {
  at: string;
  /** When the site stops saying so: five hours later, or sooner if I said I'm up. */
  until: string;
  via: "siri" | "admin";
}

export interface ManualStatus {
  text: string;
  setAt: string;
  until: string;
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
  /** A 30-second preview clip, when the store has one. */
  preview: string | null;
  durationMs: number | null;
  /** The cover's main colour, for small accents. */
  tint: string | null;
  /** True for the track playing right now. */
  nowPlaying: boolean;
  /** For the playing track: when the site first saw it start. */
  startedAt: string | null;
  /** When it was played; null while it's still playing. */
  at: string | null;
  /** When I first ever heard it, if that was in the last two weeks. */
  firstHeard: string | null;
  /** 🔥 reactions from visitors (playing track only). */
  fire: number | null;
}

/** Listening over time, from Last.fm. Served by /api/listening. */
export interface ListeningStats {
  /** Most played songs in the last month. */
  onRepeat: { track: string; artist: string; plays: number; image?: string | null; url?: string; preview?: string | null }[];
  topArtists: { name: string; plays: number }[];
  /** Plays per hour of the day in Pune over the last `windowDays` days. */
  clock: number[] | null;
  windowDays: number;
  windowPlays: number | null;
  /** Days in a row with at least one play. */
  streakDays: number | null;
  /** The streak is at least as long as the window can see. */
  streakCapped: boolean;
  totalPlays: number | null;
  /** When my Last.fm history starts. */
  since: string | null;
  fetchedAt: string;
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
  /** Colours of my most recent saves, newest first. */
  palette: string[];
  /** The board I've saved to most in the last 30 days. */
  hotBoard: { name: string; url: string; count: number } | null;
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
  /** Total boards, including any not listed below. */
  boardCount: number | null;
  /** Monthly profile views, when Pinterest shares it. */
  monthlyViews: number | null;
}

export interface PinterestBoard {
  name: string;
  url: string;
  pinCount: number | null;
  cover: string | null;
  /** Up to four recent pins, for a mosaic cover. */
  mosaic: string[];
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

/** One thing I did today, for the day's timeline. */
export interface TodayEvent {
  kind: "music" | "code" | "pin" | "move" | "sleep";
  at: string;
  /** For a run of songs: when it ended. */
  until?: string;
  title: string;
  detail: string | null;
  url: string | null;
  image?: string | null;
  /** A 30-second clip, for a single song, when the store has one. */
  preview?: string | null;
}

/** A song or note a visitor sent, once I've approved it. */
export interface Submission {
  id: number;
  kind: "song" | "note";
  name: string | null;
  message: string | null;
  song: { track: string; artist: string; art: string | null; link: string; preview: string | null } | null;
  at: string;
  /** For sent songs: how often I've played it since, and when first. */
  played?: { n: number; first: string } | null;
}

/** Everything live in one response, polled by the page. */
export interface Live {
  presence: Presence;
  music: Music;
  /** Changes whenever the Pinterest data changes, so the page knows to refetch it. */
  savedVersion: string | null;
  fetchedAt: string;
}

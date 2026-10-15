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
  /** From Last.fm. Null unless LASTFM_USER + LASTFM_API_KEY are set. */
  music: {
    track: string;
    artist: string;
    url: string;
    nowPlaying: boolean;
    at: string | null;
  } | null;
  /** Current weather in Pune (Open-Meteo). */
  weather: {
    tempC: number;
    label: string;
  } | null;
  fetchedAt: string;
}

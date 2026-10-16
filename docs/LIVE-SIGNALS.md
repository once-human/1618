# Live signals

Two endpoints: `GET /api/presence` (GitHub, weather) polled every 60 s, and `GET /api/music` polled every
15 s and immediately when the tab becomes visible again. Music is cached 10 s at the edge only.
Each source is cached separately with `"use cache"` + `cacheLife` in `src/lib/presence/server.ts`.

| Signal | Source | Setup | Cache |
| --- | --- | --- | --- |
| Pune time + part of day | Visitor's browser, Asia/Kolkata | none | n/a |
| Pune weather | Open-Meteo | none | 15 min |
| Latest public activity | Newest of GitHub `events/public` and repo `pushed_at` (events lag by hours), plus the latest commit message | none (optional `GITHUB_TOKEN`) | 5 min |
| "Updated X ago" per project | GitHub `users/once-human/repos` `pushed_at` | set `repo` on the project in `src/content/projects.ts` | 5 min |
| Pinterest profile + all public boards | Data embedded in the public profile page; each board's widget feed for pin counts and covers. (Pinterest's internal JSON endpoints answer 403 to servers.) | none (username in `src/lib/presence/pinterest.ts`) | 30 min shared runtime cache |
| Latest Pinterest saves | Widget feed (images, sizes, boards) merged with the profile RSS feed (save times) by pin id | none | 10 min shared runtime cache; page checks every 5 min |
| Now playing + tracklist (10 different songs, latest play each) | Last.fm `user.getrecenttracks` (data), iTunes Search (cover + Apple Music link) | `LASTFM_USER`, `LASTFM_API_KEY` | 10 s edge; Apple lookups cached for weeks |

Rule: a signal is real or hidden. With no music source, the listening section says what's usually on and that the live list isn't connected.

## Turning on music (Apple Music)

Apple Music has no live "now playing" API, and its recently-played endpoint returns no play times, so
"2 days ago" can't come from Apple directly. Instead, a scrobbler on the iPhone sends every play to
Last.fm with a timestamp, and the site reads Last.fm.

1. Make a Last.fm account.
2. On the iPhone, install a scrobbler for the stock Music app (FastScrobbler is free and scrobbles in
   real time) and sign it in to Last.fm.
3. Create an API key at https://www.last.fm/api/account/create.
4. In Vercel → project 1618 → Settings → Environment Variables, add `LASTFM_USER` and
   `LASTFM_API_KEY` (Production), then redeploy.

## Rate limits

Unauthenticated GitHub allows 60 requests per hour per IP. The 5-minute cache uses about 36 (three calls per refresh). Add a
fine-grained `GITHUB_TOKEN` with no scopes (public data only) if that ever gets tight.

## Privacy

Public commit messages show up in the profile ("Pushed to 1618 · 'Fix …'"). Private repos never
appear, because only public events are read.

## Limits worth knowing

- **Paused vs playing.** Neither Apple Music nor Last.fm reports a paused state. "Playing" means the
  scrobbler has told Last.fm a song is on; Last.fm clears that on its own once the song's length has
  passed. A paused song can keep showing as playing until then.
- **Last.fm is not open source.** It's only the pipe, because Apple has no listening API. Links go to
  Apple Music. ListenBrainz is the open-source alternative and could replace it if a scrobbler that
  sends to it is set up on the phone.
- **Pinterest "created" pins and following count** aren't in any public source. They would need
  Pinterest's official API with a one-time developer app and login. The section shows them
  automatically if they're ever provided.

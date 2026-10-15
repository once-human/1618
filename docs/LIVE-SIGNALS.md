# Live signals

Served by `GET /api/presence` (`src/app/api/presence/route.ts`), polled by the page every 60 s.
Each source is cached separately with `"use cache"` + `cacheLife` in `src/lib/presence/server.ts`.

| Signal | Source | Setup | Cache |
| --- | --- | --- | --- |
| Pune time + part of day | Visitor's browser, Asia/Kolkata | none | n/a |
| Pune weather | Open-Meteo | none | 15 min |
| Latest public activity | Newest of GitHub `events/public` and repo `pushed_at` (events lag by hours), plus the latest commit message | none (optional `GITHUB_TOKEN`) | 5 min |
| "Updated X ago" per project | GitHub `users/once-human/repos` `pushed_at` | set `repo` on the project in `src/content/projects.ts` | 5 min |
| Now playing / last played | Last.fm `user.getrecenttracks` | `LASTFM_USER`, `LASTFM_API_KEY` | 30 s |

Rules: a signal is real or hidden. Static facts live in `src/content/always.ts` under "Always" and are
never styled as live.

## Turning on music

1. Make a Last.fm account and connect Spotify to it (Last.fm settings → Applications → Spotify
   scrobbling).
2. Create an API key at https://www.last.fm/api/account/create.
3. In Vercel → project 1618 → Settings → Environment Variables, add `LASTFM_USER` and
   `LASTFM_API_KEY`, then redeploy.

## Rate limits

Unauthenticated GitHub allows 60 requests per hour per IP. The 5-minute cache uses about 36 (three calls per refresh). Add a
fine-grained `GITHUB_TOKEN` with no scopes (public data only) if that ever gets tight.

## Privacy

Public commit messages show up in the profile ("Pushed to 1618 · 'Fix …'"). Private repos never
appear, because only public events are read.

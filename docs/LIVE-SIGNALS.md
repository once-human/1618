# Live signals and the history store

The page polls one endpoint, `GET /api/live` (presence + music + a Pinterest version stamp), every
15 s with an ETag; an unchanged answer is an empty 304. Pinterest (`/api/saved`) is refetched only
when its stamp changes. Slower parts poll their own routes: `/api/listening` (10 min),
`/api/timeline` (2 min), `/api/replay` (30 min), `/api/submissions` (1 min).

## Sources

| Signal | Source | Setup | Cache |
| --- | --- | --- | --- |
| Where I am (city), my time, your time | `POST /api/location` from a Shortcut or /admin; Pune by default; browser for your time | `ADMIN_SECRET` | until changed |
| Weather where I am | Open-Meteo (coordinates rounded to ~10 km) | none | 15 min, shared |
| Code activity | GitHub public events (one shared fetch for presence, timeline and sync) + repo `pushed_at` + latest commit | none (optional `GITHUB_TOKEN` raises GitHub's limit from 60 to 5,000 an hour; `GITHUB_WEBHOOK_SECRET`) | 10 min, or instantly via webhook |
| Now playing + tracklist | Last.fm `user.getrecenttracks` | `LASTFM_USER`, `LASTFM_API_KEY` | 10 s edge |
| Covers, links, previews, song length, cover tint | iTunes Search → artist catalog → Deezer + song.link | none | weeks per song |
| On repeat this month, when I listen, streak, new-to-me | Last.fm top tracks/artists (1 month) + last 30 days of plays | as above | 1 h |
| Pinterest profile, boards, mosaics | Profile page data + each board's widget feed | none | 30 min |
| Latest saves | Widget feed + RSS (save times) | none | 10 min |
| Runs and rides | Strava API, public activities only | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, then `/api/strava/connect?key=…` once | synced |
| Steps, sleep, workouts | Apple Health via an iPhone Shortcut → `POST /api/ingest/health` | Shortcut with `ADMIN_SECRET` | per day |
| My status | iPhone Shortcut → `POST /api/status` | Shortcut with `ADMIN_SECRET` | expires on its own |

Rule: a signal is real or hidden.

## The history store

Neon Postgres (`DATABASE_URL`); schema in `db/schema.sql`. It keeps every scrobble, pin, push,
Strava activity and Health day, plus song lengths for "minutes listened".

**Sync** (`src/lib/history/sync.ts`) pulls only what's new and backfills older Last.fm history 3,000
plays per run until it reaches the first scrobble. It runs:

- whenever someone loads the site (at most every 5 minutes),
- every 15 minutes from GitHub Actions (`.github/workflows/sync.yml`, no secret needed),
- daily from Vercel cron (`/api/cron/daily`, which also cleans up).

**Reading it:** `/api/history?range=week|month|year|all&at=…` or `?from=YYYY-MM-DD&to=YYYY-MM-DD`;
`/api/replay` (year so far); `/api/timeline` (last 48 hours, merged with live sources).

## Things only I do

- **`/admin?key=<ADMIN_SECRET>`**: hide or delete guestbook posts and sent songs, set my status,
  see the store's size and last sync, connect Strava, run a sync.
- **Location**: from /admin type a city, or a Shortcut POSTs `{ "city": "Bengaluru", "lat": …, "lon": … }`
  to `/api/location` with the admin header. City level only.
- **Status Shortcut**: "Get contents of URL", POST to `https://www.onkaryaglewad.in/api/status`,
  header `Authorization: Bearer <ADMIN_SECRET>`, JSON `{ "text": "…", "hours": 3 }`.
- **Health Shortcut** (personal automation, e.g. daily at 23:30): find today's step count, walking
  distance, sleep and workouts, then POST JSON to `/api/ingest/health` with the same header:
  `{ "steps": 8214, "distanceKm": 6.1, "sleepHours": 7.2, "workouts": [{ "type": "Running", "start": "…", "minutes": 31, "distanceKm": 5.2 }] }`.
  Only send what you want shown.

## Visitors

- **Send me a song / guestbook**: `/api/submit`. Songs are re-looked-up on Apple by id. A light
  filter (`src/lib/moderation.ts`, tested) refuses links, slurs, explicit words, ASCII drawings and
  copy-paste spam, lowercases shouting, and replies like a person. Posts that pass go up straight
  away; anything can be hidden from `/admin`. Three posts an hour per visitor.
- **Rate limits** use a salted, one-way hash of the IP that changes daily (`visitorKey` in
  `src/lib/db.ts`); no IP is ever stored.
- **People here** (`src/lib/presence/here.ts`, `roster.ts`, tested): every tab joins one channel on
  Supabase Realtime (a free project used for nothing else). A person is a browser: one random id
  in local storage, so tabs count once and a private window or another device counts separately.
  Two signals are merged: each tab broadcasts "hi"/"bye" (seen by others in ~5-400 ms), and the
  server's presence list settles the truth ~2.5 s later and catches tabs that die without a word.
  A reload keeps its tab id, and someone's last tab gets a 1.5 s grace, so reloads never dip.
  Background tabs step out after a minute. No connection, no number. Measured live: arrivals
  50-400 ms, closed tabs <20 ms, closed site 1.5 s, dead machines 1.5-4 s. Free plan: 200 open
  tabs at once; past that, extra tabs show no count. `presence/` holds a tested self-hosted
  alternative (one Bun file) for if that's ever outgrown.
- **Visitors**: each person once a day (`visitors` table of daily hashes); the nightly job folds
  past days into one number and deletes the hashes.
- **🔥**: a count per song, one per visitor per song every 10 minutes.

## Limits worth knowing

- **Paused vs playing, and song position.** Neither Apple Music nor Last.fm reports them. The start
  is estimated (previous scrobble + its length, or when the site first saw the song), and a song still
  "playing" a minute past its length is shown as last played.
- **Minutes listened** are estimated from known song lengths; unknown ones count as 3½ minutes. The
  share of real lengths grows as the sync looks them up.
- **Pinterest**: public pages embed 10 boards and no monthly views; the official API (planned)
  would give all boards.
- **Apple Health** has no web API, hence the Shortcut.
- **Vercel's free plan** runs cron once a day; GitHub Actions and visits keep the store fresh in
  between.

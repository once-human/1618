# Architecture

## What this is

A personal site that tells Onkar's story as one ordinary day (06:59 → 22:00), then lists the work,
and around that is a set of things that are *live*: what he's listening to, building, saving and
doing on the laptop, who else is reading, and a chat that reaches his phone. Everything shown is real
or hidden ("a signal is real or hidden"). `docs/LIVE-SIGNALS.md` is the detailed reference for the
live parts; this file is the map.

## Principles

1. **Honest.** Nothing is invented. If a source can't be reached, that piece is left out.
2. **Private by design.** No cookies for visitors, no IP addresses stored, scrambled one-way codes
   for anything that needs one, short retention. See `/privacy` (`src/app/privacy/page.tsx`) and keep
   it in step with the code whenever something that collects data changes.
3. **Quality over cost-cutting.** Never lower resolution to buy performance.
4. **Fast first paint.** Pages stream a cached snapshot of their live data (`src/lib/seed.ts`, `<Seed>`)
   so nothing waits on a second request.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, `cacheComponents`, `proxy.ts`) + React 19 + TypeScript. **This Next differs from older versions: read `node_modules/next/dist/docs/` first** (see `AGENTS.md`). |
| Styling | Tailwind v4 (via `@tailwindcss/turbopack`), Archivo variable font served locally |
| Scroll | Lenis + GSAP ScrollTrigger (`components/scroll/SmoothScroll`, `components/Experience.tsx`) |
| Database | Neon Postgres via `@neondatabase/serverless` (`src/lib/db.ts`, schema in `db/schema.sql`) |
| Realtime | Supabase Realtime (who's here, chat replies). `presence/` is an unused self-hosted fallback |
| Hosting | Vercel (one daily cron) + GitHub Actions (15-minute sync, see `.github/workflows`) |
| Tests | `node --test` through `tsx` (`pnpm test`); CI runs lint, typecheck, test, build |
| Package manager | pnpm |

## Layout

```
src/
  app/                     Routes: / , /work, /work/[slug], /now, /history, /status, /talk, /privacy,
                           /admin (private), and every API route under api/ (see below)
  components/
    Experience.tsx         The home page: hero, day chapters, work, listening, saved, say hi
    home/ live/ pages/     Sections of the home page, the live line (Signals), /now, /status, globe + map
    site/                  Nav, Footer, command menu (⌘K), tracker, here-keeper, page transitions
    admin/                 The /admin app
    scroll/                SmoothScroll; FrameSequence (written for scrubbed footage, currently unused)
  content/                 Hand-written copy: story.ts (the day), projects.ts, profile.ts, now.ts, land*.ts (map data)
  lib/
    presence/              Live state: brain.ts (the Signals sentence), sleep/asleep/bedtime, here (presence),
                           lastfm, pinterest, server.ts (gathers the live data), device hash, words/voice
    desk/                  The laptop agent: model.ts (clean samples, spans, rollups), server.ts, export
    history/               Sync from Last.fm/GitHub/Pinterest into Postgres, queries, timeline, sessions, soundtrack
    visits/                The visitor log (client, server, shared)
    talk/                  Talk-to-me: chat server rules, Telegram bridge, client
    features.ts            The list behind /status (each line computed from the real thing)
    moderation.ts bots.ts ua.ts sky.ts geo.ts ...
  proxy.ts                 Logs bots/crawlers that don't run JavaScript
db/schema.sql              Idempotent schema (run again any time)
scripts/                   make-land.mjs (dot-grid world), shortcuts/ (iPhone Shortcuts), extract-frames.sh (legacy)
presence/                  Spare self-hosted presence server (Bun), not deployed
docs/                      This file, LIVE-SIGNALS.md, CONTENT-VERIFY.md, ASSET-BRIEFS.md
```

## How data flows

- **Sources → store.** Last.fm scrobbles, GitHub events, Pinterest pins, Apple Health (from a
  Shortcut) and the laptop agent land in Neon. `lib/history/sync.ts` pulls what's new (on visits, every
  15 min from Actions, daily from cron). The laptop agent and phone Shortcuts push to `/api/ingest/*`,
  `/api/status`, `/api/bedtime`, `/api/location`, authenticated with `ADMIN_SECRET`.
- **Live line.** `GET /api/live` (ETag, polled every 15 s) returns presence + music; `lib/presence/brain.ts`
  folds phone and laptop signals into one sentence in a fixed order of importance.
- **Pages.** Server components read cached snapshots; client components poll their own slower routes
  (`/api/listening`, `/api/timeline`, `/api/replay`, `/api/submissions`).
- **Visitors.** `Tracker` batches page/scroll/time events to `/api/track`; `proxy.ts` covers bots; the
  daily cron folds visits older than 30 days into counts. `/api/here` hands each tab a daily device
  hash for the live count.
- **Chat.** `/api/talk` stores messages and forwards to Telegram; replies return over a realtime channel
  only that browser knows, with a poll as backup.
- **Admin.** `/admin` (site key, signed HttpOnly cookie) moderates posts and chats, sets status/place,
  shows visitors (People / Visits tabs), the laptop record, sources, Telegram, and downloads Shortcuts.

## Environment variables

`DATABASE_URL`, `ADMIN_SECRET`, `HASH_SALT`, `LASTFM_USER`, `LASTFM_API_KEY`, `TELEGRAM_BOT_TOKEN`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY`, `CRON_SECRET`; optional `GITHUB_TOKEN`,
`GITHUB_WEBHOOK_SECRET`. Without them the day and the work index still render; the live parts drop out.

## Known gaps and risks

- The scroll story has no photographs yet: each frame is a tone placeholder with a caption of the picture
  it waits for (`src/content/story.ts`, `docs/ASSET-BRIEFS.md`).
- Free-tier limits: Supabase Realtime 200 concurrent tabs; Vercel cron once a day.
- `profile.ts` contact links (email, LinkedIn, X, Telegram) and `now.ts` lines are intentionally empty
  until Onkar fills them.
- Mobile is supported by the layout but has had less polish than desktop.

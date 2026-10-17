-- The site's database (Neon Postgres). Safe to run again: everything is "if not exists".

-- Small key/value store: my status, the song playing and since when, sync state, tokens.
CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

-- History store
CREATE TABLE IF NOT EXISTS scrobbles (uts bigint NOT NULL, track_key text NOT NULL, track text NOT NULL, artist text NOT NULL, album text, PRIMARY KEY (uts, track_key));
CREATE INDEX IF NOT EXISTS scrobbles_uts ON scrobbles (uts DESC);
CREATE INDEX IF NOT EXISTS scrobbles_key ON scrobbles (track_key);
CREATE TABLE IF NOT EXISTS track_meta (track_key text PRIMARY KEY, duration_ms integer, image text, link text, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS pins (id text PRIMARY KEY, data jsonb NOT NULL, saved_at timestamptz, first_seen timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS pins_saved_at ON pins (saved_at DESC);
-- Pushes (gh:*), Strava activities (strava:*), Health workouts (health:*)
CREATE TABLE IF NOT EXISTS events (id text PRIMARY KEY, kind text NOT NULL, at timestamptz NOT NULL, data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS events_kind_at ON events (kind, at DESC);
CREATE INDEX IF NOT EXISTS events_at ON events (at DESC);
CREATE TABLE IF NOT EXISTS health_days (day date PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

-- Visitors
CREATE TABLE IF NOT EXISTS counters (name text PRIMARY KEY, n bigint NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reactions (track_key text PRIMARY KEY, n integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS here (id text PRIMARY KEY, last_seen timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS submissions (id bigserial PRIMARY KEY, kind text NOT NULL, name text, message text, payload jsonb, status text NOT NULL DEFAULT 'pending', hidden boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS submissions_kind_status ON submissions (kind, status, created_at DESC);
CREATE TABLE IF NOT EXISTS ratelimit (key text PRIMARY KEY, n integer NOT NULL DEFAULT 0, window_start timestamptz NOT NULL DEFAULT now());

-- Clean titles and individual artists, worked out by src/lib/history/credits.ts
ALTER TABLE scrobbles ADD COLUMN IF NOT EXISTS title text, ADD COLUMN IF NOT EXISTS credit text,
  ADD COLUMN IF NOT EXISTS artists text[], ADD COLUMN IF NOT EXISTS artist_keys text[], ADD COLUMN IF NOT EXISTS song_key text;
CREATE INDEX IF NOT EXISTS scrobbles_song ON scrobbles (song_key);
-- Is "A & B" one act? Checked against my own history, then Apple Music.
CREATE TABLE IF NOT EXISTS artist_credits (credit text PRIMARY KEY, single boolean NOT NULL, checked_at timestamptz NOT NULL DEFAULT now());
-- Daily visitor hashes, folded into counters.visitors_archived each night
CREATE TABLE IF NOT EXISTS visitors (day date NOT NULL, who text NOT NULL, PRIMARY KEY (day, who));
ALTER TABLE here ADD COLUMN IF NOT EXISTS who text;

-- Talk to me live: visitor messages go to my Telegram, my replies come back
CREATE TABLE IF NOT EXISTS talk_threads (id text PRIMARY KEY, city text, country text, page text, created_at timestamptz NOT NULL DEFAULT now(), last_at timestamptz NOT NULL DEFAULT now(), name text, who text, via text, blocked boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS talk_messages (id bigserial PRIMARY KEY, thread text NOT NULL REFERENCES talk_threads(id) ON DELETE CASCADE, side text NOT NULL, text text NOT NULL, tg_id bigint, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS talk_messages_thread ON talk_messages (thread, id);
CREATE INDEX IF NOT EXISTS talk_messages_tg ON talk_messages (tg_id) WHERE tg_id IS NOT NULL;
-- City-level place for today's visitors map (deleted with the hashes each night)
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS city text, ADD COLUMN IF NOT EXISTS country text, ADD COLUMN IF NOT EXISTS lat real, ADD COLUMN IF NOT EXISTS lon real;
-- A scrambled code from the sender's browser, so they can be told when I play their song
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS sender text;

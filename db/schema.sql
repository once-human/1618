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
CREATE TABLE IF NOT EXISTS issues (month text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Visitors
CREATE TABLE IF NOT EXISTS counters (name text PRIMARY KEY, n bigint NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reactions (track_key text PRIMARY KEY, n integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS here (id text PRIMARY KEY, last_seen timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS submissions (id bigserial PRIMARY KEY, kind text NOT NULL, name text, message text, payload jsonb, status text NOT NULL DEFAULT 'pending', hidden boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS submissions_kind_status ON submissions (kind, status, created_at DESC);
CREATE TABLE IF NOT EXISTS ratelimit (key text PRIMARY KEY, n integer NOT NULL DEFAULT 0, window_start timestamptz NOT NULL DEFAULT now());

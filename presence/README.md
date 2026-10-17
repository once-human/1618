# presence (spare, not deployed)

The live "N people here" count runs on Supabase Realtime Presence (see
`src/lib/presence/here.ts`). This folder is a self-hosted alternative, kept
because it's written and tested: one Bun file holding every tab's WebSocket
in memory, no database, no connection cap, ~30 MB of RAM for 600 tabs, joins
reaching everyone in under 50 ms.

Use it if the site ever outgrows Supabase's free plan (200 open tabs at once).
It needs an always-on host, e.g. a Railway Function (Hobby plan):

    PORT=3000 bun index.ts

Then point the client at `wss://<host>/ws?b=<browser id>&t=<tab id>`; it sends
`{"n":people,"t":tabs,"y":your tabs}` on every change.

# 1618

My portfolio, told as one ordinary day.

It opens at 06:59 with my name running across a handful of photographs. As you scroll, the day
moves forward: morning, a door, coffee, a run, a room full of people, music on the walk home, and
finally the kitchen counter at night. The clock in the top corner follows along. Each part of the day
says one true thing about who I am and how I work.

After the day comes the work: a plain index of what I've built, each with its own page.

**Live:** [onkaryaglewad.in](https://onkaryaglewad.in)

## Live, for real

A few things on the page are happening right now rather than written once:

- **Lately.** One line that says where I am (listening, around, or probably asleep), my time next to
  yours, how many people are here, and a diary of the last 48 hours that writes itself: listening
  sessions, pushes, saves, runs.
- **Listening.** What I'm playing on Apple Music right now, roughly how far into the song I am, and
  what I played before. Press any cover to hear 30 seconds. Below it: what's on repeat this month,
  the hours I listen at, and the year so far, recap-style, kept live. You can send me a song.
- **Saved.** My Pinterest: profile, boards as little mosaics, the colours of what I've been saving,
  and the latest saves, which slide in on their own.
- **Say hi.** A guestbook. Be nice; a light filter keeps the worst out.
- **Work.** Projects with a public repository say when they were last updated.

Everything the live parts see is also kept, so it can be looked back on: [/history](https://onkaryaglewad.in/history)
searches any week, month or year, and [/now](https://onkaryaglewad.in/now) is what I'm up to this month.
[/status](https://onkaryaglewad.in/status) shows whether every source is answering.

If a live source can't be reached, that piece is simply left out. Nothing is made up. Press ⌘K
anywhere to jump around.

The site has no cookies, analytics or tracking. The [privacy page](https://onkaryaglewad.in/privacy)
explains exactly what it reads, what it keeps, and from where.

## What's in the work index

| Project | What it is |
| --- | --- |
| SAHN | A marketplace for events, specced in depth, then shelved on purpose |
| Head-tracked window | Lean around a photo in your browser using only your webcam |
| Project Friday | Claude built into a Linux desktop, not bolted on as a chat window |
| PixelOS for sky | Public custom Android builds for the Redmi 12 5G / POCO M6 Pro 5G |
| PuneFOSS | Open-source meetups in Pune, 400+ people at the biggest one |
| Still Breathing | A dark, cinematic tee label, with a goofy sister line called Split Lip |

## Still being made

The photographs are still being shot. Until each one exists, its place on the page is a plain tone
close to the real picture's colour, captioned with what it will show.

## Built with

Next.js, TypeScript and Tailwind, with GSAP and Lenis for the scroll, set in Archivo (its width axis
is what squeezes the big words when you scroll fast). Server routes gather the live pieces (Last.fm,
Apple Music, Pinterest, GitHub, Strava, Open-Meteo) and cache each on its own schedule; a small Neon
Postgres database keeps the history. Hosted on Vercel.

## Run it locally

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000. The day and the work index work without any setup. The live parts
need their keys and the database; `docs/LIVE-SIGNALS.md` lists them.

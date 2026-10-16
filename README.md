# 1618

My portfolio, told as one ordinary day.

It opens at 06:59 with my name running across a handful of photographs. As you scroll, the day
moves forward: morning, a door, coffee, a run, a room full of people, music on the walk home, and
finally the kitchen counter at night. The clock in the top corner follows along. Each part of the day
says one true thing about who I am and how I work.

After the day comes the work: a plain index of what I've built, each with its own page.

**Live:** [1618-sooty.vercel.app](https://1618-sooty.vercel.app)

## Live, for real

A few things on the page are happening right now rather than written once:

- **Pune, right now.** The footer shows the actual time and weather where I am.
- **Listening.** A tracklist of what I've actually been playing, newest first: what's on right now,
  what played an hour ago, what played two days ago.
- **Work.** Projects with a public repository say when they were last updated.

If a live source can't be reached, that piece is simply left out. Nothing is made up.

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

Next.js, TypeScript and Tailwind, with GSAP and Lenis for the scroll, set in Archivo. A small server
route gathers the live pieces (GitHub, Open-Meteo, Last.fm) and caches each one on its own schedule.
Hosted on Vercel.

## Run it locally

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000. Everything works without setup except the tracklist, which needs
Last.fm details (see `docs/LIVE-SIGNALS.md`).

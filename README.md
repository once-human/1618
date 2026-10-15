# 1618

My portfolio, told as one ordinary day.

It opens at 06:59. As you scroll, the day moves forward: the clock in the corner ticks, the light
changes colour, and each part of the day says something true about who I am and how I work. Morning,
a door, coffee, a run, a room full of people, music on the walk home. The day ends at a kitchen
counter, where a bag holds everything I've been building. Open it and the projects come out.

If you just want the work, there's a **Skip to work** link in the corner the whole time, and a plain
list at `/work`.

**Live:** [1618-sooty.vercel.app](https://1618-sooty.vercel.app)

## The living profile

The little bubble in the bottom corner is a nod to apps like Bump, where a profile shows what
someone is up to right now instead of a pile of old posts. Tap it and you'll see:

- **Live:** the actual time and weather in Pune, the last code I pushed to GitHub ("pushed to 1618 ·
  4m ago"), and, when it's switched on, what I'm listening to or last played.
- **Always:** the things that don't change by the minute: I've run a marathon, I drink coffee all
  day, I ran PuneFOSS.
- **Knock:** a way to say hi.

Every project with a public repo also shows when it was last updated, so you can tell what's alive
and what's resting. Nothing on the page is faked: if a signal can't be fetched, it simply isn't
shown.

## What's in the bag

| Project | What it is |
| --- | --- |
| SAHN | A marketplace for events, specced in depth, then shelved on purpose |
| Head-tracked window | Lean around a photo in your browser using only your webcam |
| Project Friday | Claude built into a Linux desktop, not bolted on as a chat window |
| PixelOS for sky | Public custom Android builds for the Redmi 12 5G / POCO M6 Pro 5G |
| PuneFOSS | Open-source meetups in Pune, 400+ people at the biggest one |
| Still Breathing | A dark, cinematic tee label, with a goofy sister line called Split Lip |

## Still being made

The scenes are currently "plates": graded frames carrying a written shot brief, standing in for the
footage. The real frames are being made shot by shot, and the counter will become a photoreal scene
you can lean around.

## Built with

Next.js, TypeScript, Tailwind, GSAP ScrollTrigger and Lenis for the scroll, and a small server
route that gathers the live signals and caches each one on its own schedule. Hosted on Vercel.

## Run it locally

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000. The live signals use public APIs and work without any setup, except
the music signal, which needs a Last.fm account (see `docs/LIVE-SIGNALS.md`).

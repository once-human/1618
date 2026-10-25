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

- **Lately.** One line that says where I am (listening, around, or asleep: when I say "Hey Siri, good
  night", my phone tells the site I went to bed, and it says so for the next few hours), my time next to
  yours, and who else is reading right now ("you, two people in Berlin and someone in Mumbai"), plus
  a diary of the last 48 hours that writes itself: listening sessions, pushes, saves, workouts, bedtimes.
- **Other people, live.** A thin rail on the right edge has a dot for everyone else on the same page,
  showing how far down they are. Hover a dot to see their town.
- **Listening.** What I'm playing on Apple Music right now, roughly how far into the song I am, and
  what I played before. Press any cover to hear 30 seconds. Below it: what's on repeat this month,
  the hours I listen at, and the year so far, recap-style, kept live. You can send me a song, and
  next time you visit it'll tell you if I played it.
- **Saved.** My Pinterest: profile, boards as little mosaics, the colours of what I've been saving,
  and the latest saves, which slide in on their own.
- **Talk to me.** On [/talk](https://onkaryaglewad.in/talk), write to me, under your name or
  anonymously. It lands on my phone, and when I reply it shows up on your screen while you're still
  there (or waits for you on any page if you've left). Your chat stays in your browser; open it on
  another device with its link, or delete it. Code blocks work, and so does a terminal:
  `curl -L -d "text=hi&name=YourName" onkaryaglewad.in/talk`. There's a guestbook too. Be nice; a
  light filter keeps the worst out.
- **Work.** Projects with a public repository say when they were last updated, and what I was
  listening to while I built them.

Everything the live parts see is also kept, so it can be looked back on: [/history](https://onkaryaglewad.in/history)
searches any week, month or year, and [/now](https://onkaryaglewad.in/now) is what I'm up to this month,
with a map of who came by this month. Its colours follow the sky over wherever I am: white by day, warm
at sunset, dark at night, with rain when it rains.
[/status](https://onkaryaglewad.in/status) lists everything the site does, where to find it, and
whether it's working right now.

If a live source can't be reached, that piece is simply left out. Nothing is made up. Press ⌘K
anywhere to jump around. In a terminal, try:

```
curl -L onkaryaglewad.in
```

The site has no cookies, no ads and no analytics company. It does keep its own visitor log, so I
can see how people find it and what they read: the town, the kind of device, and the pages in
order. Never an IP address. Each visit is kept in full for 30 days, then only as a count per
country. The [privacy page](https://onkaryaglewad.in/privacy) explains exactly what it keeps, and
at the bottom shows you everything the log holds about your own browser, with buttons to delete it
or turn it off. Browsers that ask not to be tracked aren't.

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
Apple Music, Pinterest, GitHub, Apple Health, Open-Meteo) and cache each on its own schedule; a small Neon
Postgres database keeps the history, and Supabase Realtime carries everything that has to be instant
(who's here, and replies to messages). Hosted on Vercel.

## Run it locally

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000. The day and the work index work without any setup. The live parts
need their keys and the database; `docs/LIVE-SIGNALS.md` lists them.

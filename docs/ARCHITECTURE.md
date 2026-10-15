# Architecture

## Goal

A cinematic, scroll-driven "day in my life" portfolio. Narrative first, proof of work last, with a
persistent **Skip to work →** control so recruiters never have to sit through the film.

## Hard constraints (from the planning chats)

1. **Render quality is the top priority.** "Optimise" must never mean lowering resolution or
   quality. Cut cost by loading fewer/smarter frames, never by downscaling the canvas.
2. **No camera.** All imagery is AI-generated stills (ChatGPT), turned into short clips between
   start/end frames with an AI video tool, then extracted to frames.
3. **Smooth, slow, causally connected transitions**, not vignette jump cuts.
4. **One interactive Three.js finale**, not two (mid-story phone beat folded into the finale).
5. Gym scene and laptop/coding scene are **cut**.
6. Mobile optimisation is deliberately **deferred**; desktop first.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js (App Router) + TypeScript | Vercel deploy, matches the head-track prototype |
| Styling | Tailwind v4 | Minimal chrome; the film is the UI |
| Scroll | Lenis + GSAP ScrollTrigger | Standard pairing; one shared ticker (see `SmoothScroll`) |
| Cinematic scenes | Canvas frame sequences | Real footage scrubbed, far cheaper than modelling 3D scenes |
| Interactive finale | three + @react-three/fiber + drei | Tabletop, head-tracked depth, bag → project cards |
| Package manager | pnpm | |
| Hosting | Vercel | |

## Layout

```
src/
  app/                    Next routes (/, later /work/[slug] case studies)
  components/
    Experience.tsx        Composes all scenes
    scroll/               SmoothScroll (Lenis+GSAP), FrameSequence (canvas scrubber)
    ui/                   Header (time-of-day indicator, skip-to-work)
  lib/
    scenes.ts             Narrative as data: id, time, caption, frameCount, scroll length
    frames.ts             Frame URL helper, reduced-motion check
scripts/
  extract-frames.sh       video -> public/frames/<scene>/NNNN.webp
public/frames/<scene>/    Extracted frames (gitignored, see below)
assets/                   Source stills + clips (gitignored)
docs/                     This file, STORYBOARD.md
```

## Frame sequence pipeline

1. Generate stills per scene (ChatGPT), 8-10 per scene.
2. Animate between start/end stills with a video tool (Runway/Kling/Luma, tool not decided).
3. `scripts/extract-frames.sh assets/video/<scene>.mp4 <scene-id>` writes WebP frames.
4. Set `frameCount` in `src/lib/scenes.ts`.

`FrameSequence` sizes the canvas to real device pixels, loads first/last frame first, then every
8th, then the rest, and falls back to the nearest loaded frame so scrubbing never shows blank.

## Open technical risks

- **Payload size.** Frame sequences are heavy. Measure real totals after the first scene is
  extracted before committing to fps/resolution defaults (the script defaults, 24 fps / 2560 px /
  q90, are guesses, not measured).
- **Hosting frames.** Several hundred high-quality WebPs may be better on a CDN/blob store than in
  the repo or Vercel static output. Decide after measuring.
- **Door-portal transition** (continuous shot, wardrobe change, environment swap) is the riskiest
  shot. Prototype it first, before storyboarding around it.
- **Head-tracked tabletop** is prototyped separately in `pfolio-headtrack-test`; integrating it
  into this repo is a later step.
- **Next.js version.** `create-next-app` produced Next 16 with an `AGENTS.md` warning that APIs
  differ from older versions. Check `node_modules/next/dist/docs/` when something behaves oddly.

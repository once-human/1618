# 1618

Cinematic, scroll-driven 3D portfolio: a "day in my life" film that ends in an interactive
Three.js tabletop revealing projects. (Working title: 1618.)

## Run

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm lint
pnpm typecheck
pnpm build
```

Requires Node 22+ and pnpm. `ffmpeg` is needed only for frame extraction.

## Adding frames to a chapter

1. Put the clip in `assets/video/` (gitignored).
2. `scripts/extract-frames.sh assets/video/<id>.mp4 <id>`
3. Set the printed `frameCount` for `<id>` on the chapter in `src/content/story.ts`.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): constraints, stack, pipeline, risks
- [`docs/STORYBOARD.md`](docs/STORYBOARD.md): narrative draft and open questions
- [`docs/ASSET-BRIEFS.md`](docs/ASSET-BRIEFS.md): what to generate for each chapter
- [`docs/CONTENT-VERIFY.md`](docs/CONTENT-VERIFY.md): claims to confirm before going public

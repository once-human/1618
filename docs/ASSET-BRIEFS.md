# Asset briefs (photographs, still to be made)

Onkar is making the photographs later. Until then each frame is a plain tone with a caption describing
the picture it waits for (`src/content/story.ts`, rendered by `components/home/DayChapter.tsx`).
Edit the briefs there first and keep this table in step.

## Rules for every still

- Photoreal, warm, lived-in light. Subject's face obscured, back-turned or in profile.
- Full native resolution. Never downscale for performance.
- Blur any alcohol brand labels. Same wardrobe across a chapter.
- 16:9 with generous headroom: the page crops to cover and drifts a few percent.

## Chapters (as on the site)

| id | Word | Time | Frames wanted |
| --- | --- | --- | --- |
| morning | morning | 07:00 → 07:40 | Overhead white bed in morning light; sitting up, from behind |
| door | the door | 07:40 → 08:50 | Back-turned walk to the bedroom door; the door opens onto a café |
| coffee | coffee | 09:00 → 10:30 | Window seat, cup and notebook; steam, warm wood, hands |
| run | distance | 11:00 → 12:30 | Tall grass, low sun, tracked from behind; shoes on a dirt track |
| people | people | 17:00 → 18:30 | On stage at golden hour from the side; the crowd, phones up |
| headphones | headphones | 20:00 → 21:00 | Night walk home, blurred city lights; headphones under a streetlight |
| counter | the counter | 21:00 → 22:00 | Kitchen counter, green tiles, warm light; overhead of mint, limes, a steel jigger |

The hero also has four frames (white sheets, café window, tall grass, a room full of people).

## When photos exist

Drop them in as images and replace the tone in the frame data. `scripts/extract-frames.sh` and
`components/scroll/FrameSequence.tsx` exist for scrubbed footage from short clips, but nothing uses them
today; they are optional, and if footage is added, measure the payload first.

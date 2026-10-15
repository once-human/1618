# Asset briefs

What to generate for each chapter. The same briefs are shown on the live site as "Plate" placeholders
(source: `src/content/story.ts`), so edit them there first and keep this in sync.

## Rules for every still

- Photoreal, not animated or Blender-looking. Warm, lived-in light.
- Subject's face **obscured, back-turned or in profile**. One real photo/clip only at the payoff.
- Full native resolution. Generate large; never plan to downscale for performance.
- Blur or genericise any alcohol brand labels.
- Same wardrobe/person across a chapter; wardrobe change only where the brief says so.
- 16:9, generous headroom: the page crops to cover and drifts ±7%.

## Per chapter (8-10 stills each, then start/end-frame interpolation)

| # | id | Time | Shot | Mood |
| --- | --- | --- | --- | --- |
| 01 | wake | 07:00 → 07:40 | Overhead, white bed, morning light. Asleep → sits up → camera moves behind him (third person). | Quiet, warm, slow |
| 02 | door | 07:40 → 08:50 | Back-turned walk to a door, push-in, door opens onto a café; outfit changes during the step through. | Continuous, causal. **Prototype first** |
| 03 | cafe | 09:00 → 10:30 | Café window seat, cup + notebook, face obscured, steam. | Unhurried, warm wood |
| 04 | run | 11:00 → 12:30 | Running through tall grass, tracked from behind, low sun. Enter by motion blur from the café. | Open, cool daylight |
| 05 | people | 17:00 → 18:30 | Community event, speaker at front (back/side), full room, golden hour. | Warm, social, loud |
| 06 | headphones | 20:00 → 21:00 | Night walk home, headphones, blurred city lights, from behind. | Indigo, cinematic |
| 07 | counter | 21:00 → 22:00 | Eye-level at a warm-lit kitchen counter (green tiles, white grout), prepping a drink and food; rises to an overhead top view. | Photoreal crafting table |

### Counter (finale) ingredients

Mint, limes, raspberries, a steel jigger, a pink ice tray, two unbranded bottles. Overhead photo is
the input to the head-tracked depth effect (see `pfolio-headtrack-test`).

## Pipeline

1. Stills per chapter (ChatGPT), 8-10 each.
2. Start/end-frame interpolation with a video tool (Runway / Kling / Luma, undecided).
3. `scripts/extract-frames.sh assets/video/<id>.mp4 <id>`
4. Set `frameCount` on the chapter in `src/content/story.ts`.
5. Wire the canvas scrubber into `Plate` (marked `TODO(frames)`).

## Still to decide

- The door-portal transition: one continuous generation, or two stills + a masked match-cut.
- Whether the real-face payoff shot sits in the people chapter or the counter.

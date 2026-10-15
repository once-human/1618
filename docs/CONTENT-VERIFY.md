# Content to verify before this goes public

Everything on the site was written from things Onkar told Claude in chat. Nothing was invented as a
fact, but the **wording is a first draft** and some items are public statements you may not want
public. Edit in `src/content/*.ts`.

## Decide: is this OK to publish?

| Where | Claim | Why check |
| --- | --- | --- |
| SAHN page | Whole case, including "I dropped it" and the photography-revenue reasoning | You may prefer to frame it differently, or leave it out |
| PuneFOSS page | PuneFOSS 4: ~165 tickets, ~100 attended | Honest, but less flattering than "400+" |
| PuneFOSS page | "organised ... through PuneFOSS 4" | Memory says you organised past events and stopped after 4; confirm you ran all four |
| PuneFOSS page | C-DAC Pune / BOSS Linux collaboration idea | Not agreed with them; remove if premature |
| Still Breathing | Public mention, "side project", print-on-demand | Fine if the brand is meant to be public already |
| Project Friday | Link to `once-human/project-friday` | Repo may be private → link 404s |
| PixelOS sky | "unable to brick a phone" | A strong promise; soften unless certain |
| Head-tracked window | Live URL `pfolio-headtrack-test.vercel.app` | Taken from an earlier chat; confirm it's current |

## Draft copy (lines I wrote, not you)

Beats in `story.ts` are in your voice but are mine. Lines most worth rewriting:

- "Every project I've started began the same way: walking toward a door I hadn't opened yet."
- "A good café is where most of my ideas get their first draft." (café love is stated; the "ideas" part is my flourish)
- "I'd rather ship it right than ship it twice." (from "prefers getting it right before shipping")
- "I love building things that connect people. This was that, without code."

## Left out on purpose

- Personal/family/relationship details, finances, and job-search plans.
- Ideas you haven't built (e.g. the Gen Z social app).
- Your email, LinkedIn, X, Telegram: all `null` in `src/content/profile.ts`. Add what you want public.

## Live profile

| Where | What | Why check |
| --- | --- | --- |
| Living profile → Live | Your latest public GitHub commit message, shown verbatim | Anything you push publicly is visible here |
| Living profile → Always | Marathon, coffee, PuneFOSS 400+, "consumer products end to end" | Static facts from chat; edit in `src/content/always.ts` |
| Avatar | "OY" initials | Swap for a real photo or a live profile pic later |

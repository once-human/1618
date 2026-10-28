# Content to check before it goes (or stays) public

Last reviewed: 28 October 2026.

The site's wording was drafted from things Onkar told Claude in chat, then edited. Facts weren't
invented, but some lines are public statements worth a second look. Edit in `src/content/*.ts`.

## Decide: is this OK to publish?

| Where | Claim | Why check |
| --- | --- | --- |
| SAHN page | The whole case, including "I dropped it" and the photography-revenue reasoning | Framing is a choice; leave out if you prefer |
| PuneFOSS page | PuneFOSS 3 "over 400"; PuneFOSS 4 "about 165 tickets, about 100 attended" | Honest, less flattering than "400+" |
| PuneFOSS page | "organised ... through PuneFOSS 4" | Confirm you ran all four |
| PuneFOSS page | C-DAC Pune / BOSS Linux collaboration, PuneFOSS 5 in 2027 | Not agreed with C-DAC; remove if premature |
| Still Breathing | Public mention, "side project", print-on-demand | Fine if the brand is meant to be public |
| Project Friday | Link to `once-human/project-friday` | Repo may be private (link would 404) |
| PixelOS sky | "unable to brick a phone" | A strong promise; soften unless certain |
| Head-tracked window | Live URL `pfolio-headtrack-test.vercel.app` | Confirm it's current |

## Draft lines that were written by Claude, not Onkar

Worth rewriting in your own words: "Every project starts the same way for me: walking toward a door I
haven't opened yet." / the coffee line / "I love building things that connect people. This was that,
without any code." (all in `src/content/story.ts`).

## Left out on purpose

Family and relationship details, finances, job-search plans, unbuilt ideas. Email, LinkedIn, X and
Telegram are `null` in `src/content/profile.ts`: add the ones you want public. `src/content/now.ts` is
empty, so the hand-written part of /now doesn't show.

## Live pieces: what they make public

Everything below is about Onkar, and all of it is described on `/privacy`. If one of these changes,
update that page (and its "last updated" date) in the same commit.

| Piece | What becomes public | Worth knowing |
| --- | --- | --- |
| Listening | Every track played, with times | Everything he listens to is visible |
| Signals line / timeline | Work sessions, pushes, calls, chats, watching, bedtimes | Built from the phone and the laptop agent |
| Laptop agent | App name and kind, site name only, repo, Claude Code on/off, mic in use, what's playing, battery and load | No window titles ever; YouTube never named; adult sites hidden; 7 days raw, then daily totals and stretches kept for good |
| Mic | "Probably on a call" after 90 s, "on a call" after five minutes | The mic is only detected as in use, never heard |
| Sleep / bedtime | Good night, good morning, "didn't sleep", all-nighters, naps | Inferred from gaps in activity when he says nothing |
| Place | City (and ~10 km coordinates) | Drives the clock, weather and /now sky |
| Work index | "updated X ago" from public repos | Private repos never show |
| Pinterest | Profile, boards, saves | Read from public pages; no login, no API |
| Visitors | Towns on a monthly map; a count of people | Per person, once; no IPs; 30-day detail |

## Privacy page checklist

Re-read `src/app/privacy/page.tsx` whenever you add: a new data source, a new thing stored about
visitors, a new third party, a new browser-storage key, or a retention change. Verified against the
code on 28 Oct 2026: no visitor cookies (only the admin sign-in cookie), Pinterest read from public
pages only, laptop agent and phone signals disclosed.

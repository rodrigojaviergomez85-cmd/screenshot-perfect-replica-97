<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep round-complete coach encouragements in one in-memory constant and cycle them without repeats; this preserves easy editing and session-only behavior.
- Keep the selected timer length separate from the active turn length so in-class changes apply only to the next pick.
- Persist multiple classes in localStorage under one key (each with unique id, name, roster, tallies, round, and local date) plus the last-used id; sync only the active class, reset a class's tallies and rounds (keeping names) when opened on a new local day, keep no history of past days, and delete only via confirmed per-class Delete.
- Automatic Fluency weekly record (afWeek = Monday key) and today's absence (absentDay) live on each saved student, compared against the current week/day so stale values never count; this keeps per-class isolation without storing history.
- Each saved class stores its Automatic Fluency cycle (week, queue, last pick); restore it only when the week matches, so mode switches, class switches and reloads never reopen a cycle.
- Automatic pick rules (Normal pickNormal and AF afEligibility) are pure in src/lib/fair-pick.ts with tests: last-two recency cooldown, then previous round/cycle skipped carry-priority, saved per class (Normal per day, AF per week); AF weekly-fresh is decided first and manual picks use only base eligibility, so automatic preferences never block deliberate choices.
- Picking a student never credits: a per-mode pending turn (saved per class, valid only for its day/week) is confirmed once by NEXT, a manual pick or End class, and discarded by Skip; pure logic lives in src/lib/pending-turn.ts with tests, so tallies only ever show confirmed turns.
- Keep floating Controls, Tally marks, and Mini as presentation-only views over shared class state; switching or resizing them must never alter timer, mode, pending turns, or participation data.
- Keep theme selection in a dedicated browser-wide hook/key and apply semantic root tokens to both main and PiP documents; theme changes must remain independent of class state.
- Reopening a Document Picture-in-Picture window cannot call resizeTo (Chrome needs a gesture inside that window), so measure the OS frame during a real resize and pass the matching content size to requestWindow; this keeps the Mini window at the same outer bounds across close and reopen.
- Soundboard effects use local Web Audio synthesis or licensed recorded assets via one SoundEngine owned by the class screen; YouTube favorites + effect volume live under one versioned app-wide localStorage key, separate from class storage, so views/resizes/daily resets never touch them.
- Boosters (src/lib/boosters.ts pure cues/clock + src/components/Boosters.tsx) run on their own clock and AudioContext, only pause the class timer on Start, and are stopped via a registered callback before NEXT/X; this keeps booster lifecycle from ever touching participation state.
- Compact mode is always offered (closing any PiP) and renders the same floating components in a ≤520px centered column; e2e/boosters_regressions.py drives it through the visible button instead of injected globals.

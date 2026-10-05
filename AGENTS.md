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
- Normal-round order memory (last pick + previous round's closer) is saved per class for the current local day; the pure pick rule lives in src/lib/fair-pick.ts with tests, so the closer is kept off both ends of the next round without touching AF rotation.
- Picking a student never credits: a per-mode pending turn (saved per class, valid only for its day/week) is confirmed once by NEXT, a manual pick or End class, and discarded by Skip; pure logic lives in src/lib/pending-turn.ts with tests, so tallies only ever show confirmed turns.

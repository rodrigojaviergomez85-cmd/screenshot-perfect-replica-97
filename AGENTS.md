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
- Persist only accent, coach-message list, and message-visibility preferences in localStorage; class roster, rounds, and counts must remain session-only.

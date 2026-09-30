# Quick turn-length controls

## What will change
- Add compact `10s`, `15s`, `30s`, `60s`, and custom-time chips beneath the timer on the main class screen, Float window, and Compact mode.
- Highlight the selected duration in green. Changing it affects the next picked student only, leaving the current countdown unchanged.
- Let the edit chip open an inline 5–300 second field; Enter saves and Escape cancels. A saved custom duration replaces the edit chip until the coach edits it again.
- Include the selected duration in the mini progress line.
- Add the `T` shortcut in the main screen and Float window to cycle 10 → 15 → 30 → 60, and update the visible shortcut hint.

## Technical details
- Keep the active turn duration separate from the selected duration so timer colors, progress, pause, and reset continue using the duration of the current turn.
- Reuse one small timer-chip control in all three layouts, with wrapping enabled for narrow windows.
- Preserve the setup duration as the initial selected value and keep all data session-only.

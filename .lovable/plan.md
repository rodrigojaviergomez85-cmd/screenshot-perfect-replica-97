# Immediate NEXT selection

## Changes
- Remove all shuffle-name state, timers, cycling, and animation-based blocking.
- Choose and display one pending student immediately for button, Space, and Float-window actions.
- Reset and start the timer in the same handler update as the selected name.
- Ignore repeated NEXT actions occurring within 300 milliseconds.
- Keep only the existing cosmetic name pop, capped at 150 milliseconds.

## Validation
- Confirm NEXT updates the selected student and timer immediately in the main and compact views.
- Confirm rapid repeat presses do not select twice and the app still builds cleanly.

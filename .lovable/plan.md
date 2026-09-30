# Round-complete motivation

## What will change
- Keep the ten coach messages in one editable constant array.
- Shuffle their order when a class starts, while guaranteeing message 1 for Round 1; reshuffle only after all ten are used.
- Extend the existing round-complete banner with the selected message and the requested 150 ms entrance, 2.5 second display, and 300 ms exit.
- Let NEXT or Space dismiss the banner instantly and make the next round’s pick with no delay.
- Show the same message as a compact green strip above the name in Float and Compact modes.
- Add a small, silent 20-particle confetti burst behind the main banner only.

## Technical details
- Preserve all existing screens, timer behavior, roster controls, and the no-repeat-per-round rule.
- Keep message sequence and banner state in the existing in-memory React state.
- Use CSS animations that respect reduced-motion preferences.

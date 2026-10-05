# Ultra-compact floating Mini view

## What will change
- Add a `Mini` action beside `Tally marks` in the floating Controls view and the Compact fallback.
- Render Mini as one resilient row containing the current name, timer or `∞`, NEXT, Skip, and an `Expand controls` icon.
- Keep Mini purely presentational: shared NEXT/Skip logic, shortcuts, timer, pending turns, modes, tallies, and round state remain untouched.
- On real PiP, request a compact size from the Mini click, remember the prior dimensions, and restore them when expanding when the browser permits.

## Validation
- Check 320px and 420px layouts, long/empty names, timed and no-timer states, running/paused transitions, and Controls return.
- Verify NEXT/Skip in Normal and AF using the shared handlers, including real Picture-in-Picture and Compact fallback where available.
- Run existing tests, TypeScript checks, and confirm the preview build is clean.

## Technical details
- Extend the existing floating view state with `mini`; do not alter selection or timer state models.
- Keep resize failures non-fatal and reuse the same portal/window instead of reopening it.

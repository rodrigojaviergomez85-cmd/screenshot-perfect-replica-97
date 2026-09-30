# Setup preferences

## What will change
- Add a collapsed “Preferences (color & messages)” section above the Start class controls.
- Offer six accessible accent swatches: Green, Blue, Purple, Orange, Teal, and Pink. The chosen accent updates the entire app, Float window, and Compact mode immediately.
- Add a small active-color dot beside the Fair Turns title.
- Make the motivational message list editable, removable, resettable, and expandable to 20 messages, with a 60-character limit.
- Ignore blank messages and use the original ten defaults if every custom message is removed.
- Save only the accent and motivational messages in this browser; roster, rounds, picks, and counts remain session-only.

## Technical details
- Keep the original messages in the existing single constant and derive the active list from the coach’s preferences.
- Apply semantic accent tokens through a theme attribute so existing buttons, chips, banners, progress, and student names update without changing their components.
- Load browser preferences after hydration, validate stored values, and synchronize the accent into the Float document.

# Travel Planner v11 — Dedicated Settings

## One Settings area

A settings gear now sits beside the Online / Offline badge in the header.

### App & display
- choose the screen Travel Planner opens to
- choose Day view or Full trip as the default itinerary view
- reset layout preferences

The Day / Full Trip selector has been removed from the Itinerary page itself.

### Home screen
Choose whether Home shows:
- Budget & spend
- Pre-trip warning
- Up next
- Tonight
- Payments
- Reminders
- Today's notes

You can also choose whether `Up next` displays 1, 2, 3 or 5 itinerary items.

### Summary
Choose whether Summary displays:
- Priced trip total
- Paid
- Still to pay
- Unpriced items
- Priced items
- Payment progress
- Cost by type
- Outstanding list

### Trip & budget
The old Budget > Settings area has moved here:
- trip name
- start/end dates
- total spending budget
- Day 1 hard limit
- destinations and currencies
- exchange rates

Budget now contains only Today and History.

### Notifications & reminders
Notification permission now lives in Settings.
Individual reminders remain under More > Reminders and on itinerary/pre-trip items.

### Backup, data & privacy
Export, import, erase-local-trip and privacy information now live together here.

## Device preferences

Display preferences are stored separately under `travelPlanner.ui.v1`.
They are device preferences and are not included in trip sharing, so different family members can have different layouts.

## Offline

v11 retains the corrected v10 offline architecture and caches the matching v11 HTML, CSS, JS, manifest and icons together.

## GitHub update files

Replace/upload:
- index.html
- styles.css
- app.js
- manifest.webmanifest
- sw.js
- robots.txt
- icon-192.png
- icon-512.png
- apple-touch-icon.png

Existing v10 trip data migrates automatically.

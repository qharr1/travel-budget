# Travel Planner v21 — Same-trip imports preserve the local budget

## New import behaviour

When an imported trip has the same trip ID as the trip already stored on the
device, Travel Planner now treats it as an update rather than a total overwrite.

The incoming copy updates the trip-planning data, while the current device keeps:

- total spending budget
- Day 1 hard limit
- destination/currency periods
- planning exchange rates
- expense history

This applies to:
- Import from file
- Import using a share link
- Full Trip links
- Itinerary-only links

## Why

This supports the intended workflow:

1. Export/share the trip from iPhone
2. Import it on PC
3. Edit the itinerary on PC
4. Export/share the updated trip
5. Import it back on iPhone

The iPhone's live spending budget and expenses are not replaced by the older
copy that was edited on the PC.

## Different-trip imports

If the incoming trip has a different trip ID, it is still treated as a different
trip and can replace the current one after confirmation.

If there is no trip currently stored on the device, all data from the imported
trip is imported normally.

## Other features retained

v21 keeps:
- link import
- foreign-currency conversion and booking-rate snapshots
- named travellers / attendance
- individual and split cost responsibility
- pre-trip costs
- Who Pays What summary
- light-mode default
- offline caching
- document vault
- reminders
- directions

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

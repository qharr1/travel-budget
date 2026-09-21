# Travel Planner v17 — payment controls now use attendee-card layout

## Why this version changes approach

The payment choices had their own `choice-card` component and it kept conflicting with
the app-wide form styles on iPhone.

v17 stops trying to maintain a second card component.

The payment options now use the exact same proven card structure as:

`Who's going?`

The only functional difference is:
- attendance = checkboxes / multiple selections
- payment mode = radio buttons / one selection

## Payment choices

Both itinerary items and pre-trip tasks now use the attendee-style cards for:

- Not assigned
- Individual
- Split cost

On iPhone these display as simple full-width rows with:
- control on the left
- title + description beside it

## Existing features retained

v17 keeps:
- named travellers
- attendee selection
- individual payer assignment
- split costs
- pre-trip split costs
- Who Pays What summary
- dark mode
- Settings
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

# Travel Planner v16 — Definitive iPhone payment-card fix

## What was actually wrong

The app has a global form rule:

`input { width: 100%; min-height: 48px; }`

That is correct for normal form fields, but it was also applying to the radio
buttons used by:

- Itinerary > Cost responsibility
- Pre-trip > Cost responsibility

The radio input was therefore trying to occupy the full card width and leaving
only a tiny sliver for the text. This caused the text to wrap vertically down
the right edge.

## v16 fix

Payment choice cards now use a fixed two-column layout:

- 22px radio control
- remaining card width for title + description

The radio input explicitly overrides the global input sizing.

On iPhone the options now render as normal full-width rows:

- Not assigned
  Track the event/task cost only

- Individual
  One adult pays the full cost

- Split cost
  Choose which adults are sharing it

The same fix applies to itinerary items and pre-trip tasks.

## Existing features retained

v16 keeps:
- traveller attendance
- individual/split payment responsibility
- pre-trip cost splitting
- Who Pays What Summary
- dark mode
- Settings
- offline caching
- document vault
- reminders
- itinerary directions

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

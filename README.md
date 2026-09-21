# Travel Planner v4

Version 4 keeps the budget tracker intact and improves the itinerary experience.

## Changes in v4

### 1. Colour-coded itinerary
Itinerary items are now colour coded automatically by type:

- Flight — blue
- Accommodation — purple
- Theme park — pink
- Activity — amber
- Travel — cyan
- Food — orange
- Shopping — green
- Other — grey

The same colours are reused in the Summary breakdown and outstanding-cost list.

### 2. Better iPhone add/edit screens
The itinerary item and day-edit screens become full-screen sheets on iPhone-sized displays.

They:
- respect iPhone safe-area / notch insets
- scroll themselves instead of scrolling the page behind them
- lock background scrolling while open
- keep the dialog heading/close control at the top

### 3. New Summary tab
Top-level modes are now:

- Itinerary
- Summary
- Budget

Summary calculates only what is actually entered in itinerary items.

It shows:
- total priced itinerary cost
- paid
- still to pay
- unpriced item count
- priced item count
- payment progress
- cost breakdown by itinerary type
- list of priced items still to pay

An itinerary item counts as paid when its status is `Booked - paid` or `Paid`.
`Planned`, `Confirmed`, and `Booked - unpaid` are treated as still to pay.

If a total cost is blank but per-adult / per-child costs exist, Summary can calculate the total using the trip's adult and child counts.

It never guesses missing prices.

## Updating GitHub Pages

Upload/replace the generic app files in the repository root:

- index.html
- styles.css
- app.js
- manifest.webmanifest
- sw.js
- icon-192.png
- icon-512.png
- apple-touch-icon.png

Commit to `main`.

Do NOT upload private `.trip.json` files to the public repository.

Your existing v3 trip import file remains compatible with v4.

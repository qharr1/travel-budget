# Travel Planner v15 — Who Pays What

## Summary > Cost responsibility

The Summary now has a new visual `Who pays what` section.

### Per-adult cards
Every adult traveller gets a card showing:
- Still owing
- Total responsibility
- Already paid
- Number of assigned priced items

Individual costs count fully against the selected adult.
Split costs count only that adult's share.

### Shared costs
Shows the full value of every item using `Split cost`.

It also shows:
- number of split items
- how much of those shared costs is still unpaid

### Unassigned costs
Shows priced itinerary and pre-trip items that do not currently have a valid adult payer assignment.

This makes it easy to spot costs that still need to be allocated.

### Paid vs owing
For itinerary items:
- Paid / Booked - paid = already paid
- other statuses = still owing

For pre-trip tasks, the app follows the existing pre-trip completion/paid status logic.

## Settings
Settings > Summary now includes:
- `Who pays what`

It can be shown or hidden just like the other Summary widgets.

## Coverage
The calculation includes:
- itinerary costs
- pre-trip costs
- individual payer assignments
- split payer assignments

Children never receive financial responsibility.

## Offline
v15 keeps the existing offline, dark mode, settings and local-data architecture.

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

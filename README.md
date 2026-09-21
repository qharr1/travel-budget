# Travel Planner v13 — Travellers, Attendance & Event Cost Splitting

## Travellers

Settings now has a dedicated Travellers section.

Each traveller has:
- Name
- Adult or Child

Adults can attend events and can be assigned event costs.
Children can attend events but are never shown as payers.

For existing trips that only have traveller counts, v13 creates editable placeholders:
- Adult 1, Adult 2, etc.
- Child 1, Child 2, etc.

Rename them in Settings.

## Itinerary attendance

Every itinerary item now has `Who's going?`

New itinerary items default to all named travellers attending.
Existing legacy items that were marked as `All travellers` also preselect everyone.

The itinerary card shows the attendee names.

## Event cost responsibility

An itinerary item with a total cost can use:

### Not assigned
Track the event cost, but don't assign payment responsibility.

### Individual
Choose one adult responsible for the full event cost.

### Split cost
Choose at least two adults who are splitting the event.
Travel Planner calculates the equal per-adult share automatically.

Children are intentionally excluded from payment responsibility.

A child can still have a child ticket price. `Kids don't pay` here means the child is never financially responsible for settling the event cost.

## Traveller changes

If an adult is changed to Child, or a traveller is deleted:
- attendance links are cleaned up
- payer links are cleaned up
- invalid Individual/Split assignments are reset

## Data fields added

- `trip.travellerProfiles[]`
- `itinerary[].attendeeIds[]`
- `itinerary[].paymentMode`
- `itinerary[].payerIds[]`

Existing v12 data migrates automatically.

## Offline

v13 retains the corrected offline service-worker architecture from v10+ and the v12 appearance settings.

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

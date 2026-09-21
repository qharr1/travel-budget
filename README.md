# Travel Planner v23 — Family Sync

## Family Sync

Travel Planner can now keep shared trip-planning data automatically updated
between the PC and family iPhones using Firebase Realtime Database.

### Shared automatically

- trip name and dates
- named travellers
- itinerary
- pre-trip tasks
- day details
- places / wishlist
- reminders
- travel information
- document metadata
- cost responsibility fields attached to shared itinerary/pre-trip items

### Kept local to each device

- total spending budget
- Day 1 hard limit
- live expense history
- UI/layout preferences
- day journal notes
- actual PDF/image attachment bytes

For a brand-new joining device, destination/currency periods are copied once as
bootstrap information so itinerary currencies still make sense. They do not
overwrite an established device budget later.

## Setup

Settings > Family Sync:

1. On the main device, tap `Create family sync`.
2. Share the generated private invitation link.
3. On the other device, open the link or paste it into `Join an existing family sync`.
4. From then on, shared trip changes sync automatically.

## Conflict handling

v23 stores shared collections by item ID and uses each item's `updatedAt` value.

Firebase `runTransaction()` merges the local and cloud copy before writing, so
different changes from two devices are preserved rather than simply replacing
the entire itinerary.

Deleted items are tracked with local/cloud tombstones so they do not immediately
reappear from another device.

## Offline behaviour

The PWA still works locally with no internet.

When internet returns:
- the local copy is transactionally merged with the cloud copy
- newer changes are retained
- all connected devices receive the merged result through Realtime Database

Firebase SDK modules are loaded only when Family Sync needs an internet
connection, so failure to reach Firebase does not stop the core offline app.

## Security model

v23 uses:
- Firebase Anonymous Authentication
- a cryptographically random 256-bit Family Sync ID
- Realtime Database rules that require an authenticated Firebase session

The private Family Sync invitation is effectively the family access key. Anyone
with the full link can join the shared trip, so keep it private.

## Firebase project used

- Project: travel-planner-sync
- Database region: Singapore / asia-southeast1
- Database: travel-planner-sync-default-rtdb.asia-southeast1.firebasedatabase.app

## GitHub update files

Replace/upload:
- index.html
- styles.css
- app.js
- family-sync.js
- manifest.webmanifest
- sw.js
- robots.txt
- icon-192.png
- icon-512.png
- apple-touch-icon.png

# Travel Planner v20 — Import a trip using a share link

## Settings > Backup, data & privacy

You can now import a trip in two ways:

1. Import from file
2. Import using a share link

## Import using a share link

Paste a Travel Planner share link into the new field and tap:

`Import from link`

The importer accepts:
- a full Travel Planner URL
- copied text containing the Travel Planner URL
- a `#tripshare=...` fragment
- the raw Travel Planner share payload

The link is decoded locally in the browser. No server fetch is needed.

## Full Trip vs Itinerary link

Before importing, Travel Planner tells you whether the link contains:

- `full trip, including budget data`
- `itinerary only`

If a trip is already stored on the device, you are asked to confirm before it
is replaced.

## PC -> iPhone workflow

A simple workflow is now:

1. Export/share Full Trip link on iPhone
2. Open/import link on PC
3. Make changes on PC
4. Create a new Full Trip link on PC
5. Send/copy that link to the iPhone
6. Settings > Backup, data & privacy > Import using a share link
7. Paste the link and import

## Privacy

The trip payload remains inside the URL fragment after `#tripshare=`.
Travel Planner decodes it locally.

As before, anyone who receives the complete share link can import that snapshot,
so treat Full Trip links as private.

## Existing features retained

v20 keeps:
- foreign-currency conversion and rate snapshots
- traveller attendance and split costs
- Who Pays What
- dark mode / light default
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

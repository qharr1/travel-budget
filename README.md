# Travel Planner v26 — Trip Map

## New main Map screen

Travel Planner now has a first-class `Map` tab.

The map uses MapLibre GL JS with:
- globe projection
- satellite imagery
- 3D terrain
- rotation / tilt / zoom
- navigation and globe controls

The initial map implementation does not require a paid mapping account or API key.

## Permanent pins

The map reads locations from:

- itinerary items with a Location
- Places / Wishlist items with a Location

Once a location is found, Travel Planner saves:

- latitude
- longitude
- geocoder display label
- geocoded timestamp

These fields live directly inside the itinerary/place record.

That means coordinates automatically travel with:
- normal trip export/import
- Full Trip share links
- Family Sync
- PC editing

## Marker types

Accommodation itinerary items use a hotel marker.

All other itinerary and Places/Wishlist locations use pin markers.

Wishlist places use a visually different pin colour.

## Existing trips

Opening Map for the first time performs one slow, rate-limited pass over locations
that do not yet have coordinates.

You can also tap:

`Locate missing pins`

at any time.

The missing-locations panel shows anything that still has no saved coordinate and
lets you retry one item at a time.

## New locations

When an itinerary item or saved place gets a new/changed location, Travel Planner
queues that location for geocoding.

If the location text changes, old coordinates are cleared first so a stale pin
cannot remain attached to the edited address.

## Family Sync

Latitude/longitude are part of the existing shared itinerary/place objects.

If the PC locates a hotel, Che's connected iPhone receives the coordinates.
The other phone does not need to geocode the same hotel again.

## Offline

The app, itinerary and saved pin coordinates remain local/offline capable.

The satellite imagery, terrain and first-time geocoding require internet access.
v26 deliberately does not attempt to cache entire satellite tile regions because
that could consume large amounts of iPhone storage.

## Free map sources

- Map renderer: MapLibre GL JS
- labels/base data: OpenFreeMap / OpenStreetMap
- satellite: EOX Sentinel-2 cloudless 2020 mosaic
- terrain: Mapterhorn
- geocoding: OpenStreetMap Nominatim

Geocoding is deliberately sequential and slow. It searches only records without a
saved pin rather than repeatedly geocoding the whole itinerary.

## GitHub update files

Replace/upload:
- index.html
- styles.css
- app.js
- family-sync.js
- trip-map.js
- manifest.webmanifest
- sw.js
- robots.txt
- icon-192.png
- icon-512.png
- apple-touch-icon.png

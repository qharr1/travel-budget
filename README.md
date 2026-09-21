# Travel Planner v12 — Dark Mode

## Appearance

Settings > App & display now includes:

- Use iPhone setting
- Light
- Dark

`Use iPhone setting` follows the iPhone's appearance automatically. If iOS switches between Light and Dark while Travel Planner is open, the app follows it.

Light or Dark can be forced for Travel Planner independently of the phone.

## No bright launch flash

The appearance preference is applied before the main stylesheet loads, reducing the bright white flash that can otherwise occur when opening an installed PWA in Dark Mode.

## What Dark Mode covers

Dark styling is applied across:

- Home
- Itinerary and day chips
- Summary
- Budget
- More
- Settings
- forms and dialogs
- directions chooser
- reminders
- document vault
- day notes
- paid / outstanding / warning states
- online / offline badge

Itinerary category colours remain distinct.

## Device preference

Appearance is stored in `travelPlanner.ui.v1`, alongside the other device-only layout choices.

It is not part of the shared trip, so different family members can use different themes.

## Offline

v12 keeps the corrected offline caching introduced in v10:
- complete matching app shell cached
- cached versioned CSS/JS/manifest
- offline navigation fallback
- old app caches removed during activation

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

Existing trip data and Settings preferences migrate automatically.

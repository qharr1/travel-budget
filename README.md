# Travel Planner v5

## New in v5

### Share links
The Itinerary screen now has:
- Share Itinerary Link
- Share Full Trip Link
- Export / Share Trip File

A share link contains a compressed copy of the shared data after the `#` in the URL.

`Share Itinerary Link` excludes expense history, the configured budget total, the Day 1 hard limit, and exchange rates.

`Share Full Trip Link` includes itinerary, budget setup and expense history.

Anyone who receives the complete shared link can import that shared copy, so treat the link itself as private.

### Optional Day 1 hard limit
The budget can reserve a fixed amount for Day 1.

Before and during Day 1, that amount is reserved rather than being redistributed prematurely.
If Day 1 finishes under the limit, the unused amount rolls into the remaining days.
If Day 1 exceeds the limit, future daily allowance is reduced.

### Lower search-engine visibility
The generic app now includes:
- `noindex,nofollow,noarchive`
- `robots.txt` with `Disallow: /`

This discourages search-engine indexing, but it is not authentication and the GitHub Pages website remains public.

## GitHub update files
Upload/replace:
- index.html
- styles.css
- app.js
- manifest.webmanifest
- sw.js
- robots.txt
- icon-192.png
- icon-512.png
- apple-touch-icon.png

Do not upload private `.trip.json` files.

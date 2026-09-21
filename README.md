# Travel Planner v10 — Offline Reliability Fix

## Important fix

Versions 6–9 contained a service-worker regression.

The fetch handler created:

`const url = new URL(...)`

but later referenced:

`requestUrl.pathname`

That undefined variable caused the service worker to fail when handling CSS, JavaScript and manifest requests. Online use could appear normal because the network was available, but in Airplane Mode the browser could fall back to a plain cached HTML page without the matching CSS/JS.

This explains the reported symptom:
- white/basic page
- little or no styling
- no local trip data rendered

The local trip data itself was not erased. The JavaScript required to read/render it simply was not loading offline.

## v10 fix

v10 replaces the service worker logic and:

- pre-caches the complete matching v10 app shell
- explicitly caches `app.js?v=10`
- explicitly caches `styles.css?v=10`
- explicitly caches `manifest.webmanifest?v=10`
- falls back to the matching cached `index.html` for offline navigation
- uses cache-first for versioned core assets
- removes old `travel-planner-*` caches during activation
- registers the service worker with `updateViaCache: "none"` so update checks do not get stuck behind an old HTTP cache
- shows `Offline • local data` in the connection badge

Existing itinerary, budget, pre-trip tasks, expenses, reminders, wishlist, notes and metadata remain in localStorage and migrate automatically.

Local PDF/image vault attachments remain in IndexedDB.

## Critical update/test sequence

After uploading v10:

1. Open the live Travel Planner URL while connected to the internet.
2. Close the Home Screen app completely.
3. Open it once more while still online.
4. Confirm your existing trip data is visible.
5. Turn on Airplane Mode / turn off Wi-Fi.
6. Close Travel Planner completely.
7. Reopen it from the Home Screen.

It should now load the fully styled application with the same locally stored trip data.

Do not clear Safari website data or erase local trip data to perform this test.

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

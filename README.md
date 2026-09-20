# Travel Planner v3

This version adds the full itinerary layer while keeping the existing offline budget tracker.

## Opening screen

A new user now sees only:

- Create New Trip
- Import Trip

This makes it easy to send the public app link to somebody else. They open the link, choose **Import Trip**, and select the private `.trip.json` file you sent them.

## Itinerary

The top-level app switch is:

- Itinerary
- Budget

The itinerary is day-based and supports:

- day headline / location / overnight hotel
- timed items
- duration
- type
- location
- booking status
- booking reference
- total cost
- adult cost per person
- child cost per person
- notes
- edit / delete
- free days

No routing or maps are required.

## Important privacy rule

Do NOT upload your private `.trip.json` file to the public GitHub repository.

The GitHub repository should contain only the generic app files:
- index.html
- styles.css
- app.js
- manifest.webmanifest
- sw.js
- icon-192.png
- icon-512.png
- apple-touch-icon.png

Keep your trip file in iPhone Files / iCloud Drive, or share it directly by AirDrop / Messages / email.

## Updating GitHub Pages

1. Export your existing trip first as a backup.
2. Upload and replace the generic app files above in the root of the `travel-budget` repository.
3. Commit to `main`.
4. Open the live website once while online.
5. Close and reopen the Home Screen app if the previous cached version appears first.
6. Test Airplane Mode again.

Existing v1/v2 local data is migrated automatically.

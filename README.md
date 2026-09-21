# Travel Planner v6

## Budget dashboard redesign

The Budget > Today screen now flows as:

1. Remaining Budget — large full-width hero
2. Today's Budget / Day 1 Budget — full-width progress strip
   - budget
   - amount spent
   - amount left / over
   - hard-limit badge when applicable
3. Ahead / Behind Pace
4. Available / Future Day
5. Overall trip budget progress

Before the trip, if a Day 1 hard limit is configured, the daily strip shows the Day 1 limit and Available / Future Day is calculated only across Days 2 onward.

Example:
- Total budget: A$9,000
- 21 trip days
- Day 1 hard limit: A$200
- Days 2–21: 20 days
- Future allowance before the trip: (9,000 - 200) / 20 = A$440.00/day

After Day 1, the app uses actual Day 1 spending and automatically rolls any underspend or overspend into the remaining trip.

## Update reliability

v6 adds versioned JS/CSS URLs and changes the service worker to prefer the newest core app files when online, falling back to cache when offline. This prevents a new HTML page from accidentally running an older cached calculation.

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

Existing local trip data remains compatible.

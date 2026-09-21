# Travel Planner v7

## New itinerary views

The Itinerary tab now defaults to `Day view`.

- Before the trip: Day 1 is selected.
- During the trip: the current trip date/day is selected automatically.
- If the app remains open overnight, returning to it on the next calendar day automatically moves the itinerary to that new day.
- After the trip: the final trip day is selected.

A second `Full trip` view displays every day and every itinerary item in one continuous list. Each full-list day has an `Open day` action that returns to the normal Day view.

## Pre-trip

The Itinerary tab now has a collapsible `Pre-trip` section.

Pre-trip tasks support:
- task title
- due date
- category
- status
- optional AUD cost
- notes
- quick `Mark done`
- add / edit / delete

Pre-trip tasks are included in:
- exported trip files
- itinerary share links
- full-trip share links
- Summary cost calculations

The Summary now includes a `Pre-trip` category when pre-trip tasks have entered costs.

## Private pre-trip update import

The Pre-trip section includes `Import pre-trip tasks`.

This accepts a `travel-planner-pretrip-update` JSON file and merges matching tasks into the current trip without replacing:
- itinerary
- budget
- exchange rates
- Day 1 hard limit
- expenses

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

Existing v6 local trip data migrates automatically.

# Travel Planner v25 — Timeline notes between activities

## Timeline notes

The itinerary now supports short notes directly inside the day's timeline.

A timeline note has:
- date
- optional time
- optional heading
- note text

If it has a time, it sorts between activities chronologically.

Example:

10:00 — Skyhop Bus  
12:30 — NOTE: Grab lunch near Tokyo Station  
14:00 — teamLab

If no time is supplied, the note appears under `All day`.

## Add a timeline note

In Day view, beside `+ Add item`, tap:

`+ Note`

## Timeline note vs Day journal

Timeline notes:
- appear between itinerary activities
- are intended for quick instructions / reminders
- are included in Full Trip view
- sync through Family Sync

Day journal:
- remains the existing longer-form personal notebook
- stays separate from the itinerary timeline
- remains device-local

## Family Sync

Timeline notes are a first-class shared collection.

Adding, editing or deleting one on a connected PC/iPhone syncs it to the other
family devices using the existing item-level conflict and deletion logic.

## Existing features retained

v25 keeps:
- Family Sync
- Home Screen Family Sync onboarding
- timezone-aware itinerary timing
- foreign-currency conversion
- traveller attendance
- split cost responsibility / Who Pays What
- local budget and expenses
- offline support
- documents, reminders and directions

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

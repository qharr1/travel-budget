# Travel Planner v9 — Travel Companion

## New Home screen

Travel Planner now opens to `Home`.

Before the trip it shows:
- days to go
- Day 1 budget / spend
- pre-trip warnings
- next itinerary items
- first accommodation
- next outstanding payment
- reminders

During the trip it becomes a Today screen:
- trip day
- current day title/location
- today's budget and spend
- next itinerary items
- tonight's accommodation
- next unpaid item
- reminders
- today's travel notes

## Booking / document vault

More > Booking & document vault supports:
- booking reference
- confirmation number
- phone
- website
- notes
- optional linked itinerary item
- local screenshot/PDF attachment

Attachment files are stored in IndexedDB on the current device.
Trip exports and share links include document metadata but do NOT include the attached PDF/image bytes.

## Offline emergency & travel info

More > Emergency & travel info can store:
- insurance
- embassy/consulate
- airline
- hotel
- emergency contact
- medical
- other

Phone, email and website shortcuts work from the saved card.

## Places / wishlist

More > Places / wishlist supports:
- restaurants
- shops
- attractions
- parks
- activities
- locations
- websites
- notes
- Wishlist / Scheduled / Visited status

`Add to itinerary` opens a prefilled itinerary item.
Directions reuses the Apple Maps / Google Maps / Waze chooser.

## Day notes / travel journal

Each Day view has a collapsible Day notes / journal section with multiple note entries.

During the trip, today's latest notes are also shown on Home.

## Reminders

Reminders can be:
- custom
- created directly from an itinerary item
- created directly from a pre-trip task

The app can ask for iPhone notification permission when installed as a Home Screen web app.

Important local-only limitation:
without a remote push server, the PWA cannot reliably wake itself from a fully closed or suspended state at an exact future time.

v9 therefore:
- checks due reminders while open
- checks again when returning to the app
- shows a system notification when permission is available
- shows due/upcoming reminders in Home and More
- uses the app icon badge where supported

True background scheduled push can be added later only if an online push component is introduced.

## Home Screen widgets

Native iPhone Home Screen widgets are not available to this GitHub-hosted PWA. Apple's Home Screen widgets are built using WidgetKit as part of a native app/widget extension.

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

Existing v8 local trip data migrates automatically.

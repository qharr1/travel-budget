# Travel Planner v8

## Directions from itinerary items

Any itinerary item with a location/address now shows:

- Directions
- Edit

Tapping `Directions` opens an iPhone-friendly map chooser with:

- Apple Maps
- Google Maps
- Waze
- Copy location

The Travel Planner PWA cannot reliably inspect which map apps are installed on an iPhone, so the app does not pretend to auto-detect installed apps.

Instead, the user chooses the maps service.

The links are HTTPS map/deep links:
- Apple Maps receives a destination
- Google Maps receives a directions URL with no fixed origin, allowing Google Maps to use the device's relevant current location
- Waze receives a navigate/search deep link and can open Waze when installed or the web version otherwise

For itinerary locations written as a route such as:

`Tokyo Station → Shin-Osaka`

the Directions button uses only:

`Shin-Osaka`

as the destination.

Travel Planner itself does not request the user's live GPS location; the chosen maps app handles routing.

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

Existing v7 trip data remains compatible.

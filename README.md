# Travel Planner v29 — Trip Map visible-canvas fix

## Root cause found

The Trip Map shell was correctly sized, but the actual `#tripMapCanvas` element
received MapLibre's `.maplibregl-map` class.

MapLibre's stylesheet includes a `position: relative` rule for that class.

Because MapLibre CSS was loaded after the Travel Planner stylesheet, it could
override the app's `.trip-map-canvas { position: absolute; inset: 0; }` rule.

Result:
- outer map shell stayed tall and dark
- MapLibre engine/style/source callbacks all reported ready
- actual map container collapsed / did not fill the shell
- no globe, tiles or navigation controls were visible

That matches the screenshot where all source chips were green while the large
map area remained a uniform dark background.

## Fix

v29 adds an ID-specific rule:

`#tripMapCanvas.maplibregl-map`

with explicit absolute positioning and 100% width/height.

The ID selector deliberately outranks MapLibre's class selector, so the external
library can no longer collapse the map container.

A small control-position fallback is also included so zoom/compass controls
remain visible even if MapLibre's external CSS is delayed.

## Everything else retained

- MapLibre v5.24 compatibility path
- globe rendering
- optional satellite layer
- permanent itinerary/place coordinates
- hotel and normal pins
- Family Sync of coordinates
- map filters / Fit whole trip
- offline core PWA

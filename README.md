# Travel Planner v18 — Light appearance by default

## Appearance default

New devices / new local UI settings now default to:

`Light`

The available choices remain:

- Light
- Dark
- Use iPhone setting

## Existing users

If a device already has an appearance preference saved in `travelPlanner.ui.v1`,
that saved preference is respected.

This avoids unexpectedly changing somebody who deliberately selected Dark or
Use iPhone setting.

## Launch behaviour

The early pre-stylesheet theme bootstrap also defaults to Light, preventing the
app from initially following iOS Dark Mode before Travel Planner settings load.

## Existing features retained

v18 keeps:
- attendee-style payment controls from v17
- named travellers
- individual / split costs
- pre-trip cost assignment
- Who Pays What Summary
- Settings
- offline caching
- document vault
- reminders
- directions

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

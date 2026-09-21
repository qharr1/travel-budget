# Travel Planner v19 — Foreign-currency cost conversion

## Fixed bug

Foreign itinerary costs are no longer treated as AUD.

Example:
- JPY 16,000
- planning rate 110 JPY per A$1
- Summary uses about A$145.45

The original JPY 16,000 remains visible on the itinerary item.

## Planning exchange rates

Settings > Trip & budget > Destinations & currencies now clearly treats each
stored destination rate as a planning exchange rate.

These rates are used for:
- itinerary costs
- pre-trip costs
- Summary totals
- Who Pays What
- outstanding payments
- pre-trip outstanding totals

## Snapshot behaviour

When a priced itinerary or pre-trip item is saved, v19 stores:
- original local cost
- local currency
- rate used
- AUD equivalent
- timestamp of the rate snapshot

Later Settings rate changes do not silently rewrite already-saved booking values.

## Item editor

Foreign-currency items show:
- planning rate used
- AUD equivalent

The rate can be manually changed before saving.

New itinerary items prefer the destination currency that matches the itinerary date.

## Existing foreign-currency items

Legacy JPY/CNY/etc items without a saved AUD snapshot are converted using the
current matching planning rate from Settings. Once edited and saved, the AUD
value/rate become fixed to the item.

## Offline

No live FX API is required. The stored rate and snapshots work in Airplane Mode.

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

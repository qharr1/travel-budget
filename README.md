# Trip Budget v2

This is the reusable budget-first version of the offline travel app.

## What changed in v2

- Destinations and currencies are no longer hard-coded to China/Japan.
- A trip can have as many destination/currency periods as required.
- Each destination has:
  - name
  - from/to dates
  - local currency
  - exchange rate expressed as local currency units per A$1
- Transition dates can overlap, so two destinations can both include the same travel day.
- Expense entry asks for the destination and lets you enter either AUD or that destination's local currency.
- Every expense is converted back to AUD for the main budget.
- Historic foreign-currency expenses keep the AUD value/rate used when entered.
- "Available / future day" now excludes today during an active trip:
  - remaining budget ÷ number of days AFTER today
- History now includes a Day 1 / Day 2 / Day 3... view showing:
  - rolling allocation
  - actual spend
  - variance

## Updating your existing GitHub Pages site

1. Export a backup from your existing app first.
2. Unzip this package.
3. In GitHub, open your `travel-budget` repository.
4. Upload and replace these files in the repository root:
   - index.html
   - styles.css
   - app.js
   - manifest.webmanifest
   - sw.js
   - icon-192.png
   - icon-512.png
   - apple-touch-icon.png
5. Commit directly to `main`.
6. Open the live site once while online.
7. Because this is a PWA update, close and reopen it if the old version appears at first.
8. Test again in Airplane Mode.

The app keeps using the same browser storage key, and v2 includes migration support for the original v1 data.

## Privacy

No account, analytics, advertising, remote database, or server-side storage is used. Trip data remains local to the browser/device unless you explicitly export a backup file.

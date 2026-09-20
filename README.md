# Trip Budget — GitHub Pages PWA

This folder is a complete static Progressive Web App (PWA). It uses no server-side code, database, login, analytics, advertising, or external libraries.

## What it does

- Stores trip dates and a total budget in AUD.
- Automatically recognises today's date from the phone.
- Calculates the current trip day and days remaining.
- Recalculates the remaining daily allowance after every expense.
- Accepts expenses in AUD, JPY and CNY.
- Uses exchange rates entered by you, so conversion works offline.
- Each foreign-currency expense keeps the AUD value/rate from when it was entered; changing the current rate does not rewrite your spending history.
- Stores expenses locally in Safari on that device.
- Supports edit/delete.
- Exports and imports a JSON backup.
- Uses a service worker so the app can continue to open when offline after it has been loaded successfully.

## Upload to GitHub Pages

Upload ALL of these files to the root of the GitHub repository you created:

- index.html
- styles.css
- app.js
- manifest.webmanifest
- sw.js
- icon-192.png
- icon-512.png
- apple-touch-icon.png

Do not upload only the ZIP file. GitHub Pages needs the individual files.

If GitHub Pages is configured as:
- Source: Deploy from a branch
- Branch: main
- Folder: /(root)

GitHub will publish the files as a website.

## Install on iPhone

Do this BEFORE travelling:

1. Open the published GitHub Pages URL in Safari.
2. Wait for the page to load fully.
3. Enter the trip details.
4. Close Safari and reopen the page once to confirm it loads.
5. In Safari, tap Share.
6. Tap "Add to Home Screen".
7. Open the new Trip Budget icon from the Home Screen.
8. Turn on Airplane Mode temporarily and open it again to confirm offline operation.
9. Turn Airplane Mode back off.

That offline test is important before travelling.

## Privacy

Budget details and expense entries are not written to the GitHub repository. They are stored in the browser's local storage on the device.

Anyone can view the public website source code, but they cannot see your locally stored budget or expenses from the repository.

Export a backup periodically. Browser storage can be erased if Safari website data is cleared, the app is removed in some circumstances, or the phone is reset.

## Updating the app later

When a new version is provided, replace the website files in GitHub with the new versions. Existing budget data is stored separately in Safari local storage and should normally remain intact, but exporting a backup first is strongly recommended.

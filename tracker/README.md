
# My Personal Tracker

**A private, offline-first Progressive Web App (PWA) for tracking college study, workouts, and personal finances.**

Built with plain HTML, CSS, and JavaScript. No backend, user accounts, analytics, advertisements, frameworks, or remote fonts and scripts.

## Features

- **College:** Organize semesters, subjects, topics, and daily study notes.
- **Workout:** Track exercises, completion checklists, recovery check-ins, and notes using a consistent seven-day workout/rest cycle.
- **Money:** Record money received, spent, and saved; view your remaining balance and total recorded savings.
- **Backup and restore:** Export records to JSON and restore them after validation and confirmation.
- **Offline support:** Access the app without an internet connection after its files have been cached.
- **Privacy-focused storage:** Keep records in browser-local storage without sending them to a backend.
- **Mobile-friendly interface:** Install the app on a supported Android device or use it in a desktop browser.
- **Dark mode:** Follow the device's light or dark appearance preference.

## Technology stack

| Technology | Purpose |
|---|---|
| HTML | Page structure and navigation |
| CSS | Responsive design, themes, and layout |
| JavaScript | Application logic and data management |
| localStorage | Local record storage |
| Service Worker | Offline caching and app updates |
| Web App Manifest | Installation metadata and app icons |

No database server or account is required.

## Project structure

```text
tracker/
├── index.html
├── style.css
├── app.js
├── sw.js
├── manifest.webmanifest
├── icon.svg
├── icon-192.png
└── icon-512.png
```

- `index.html` — Main page structure and navigation.
- `style.css` — Theme, responsive layout, and component styling.
- `app.js` — Application logic, record management, validation, and rendering.
- `sw.js` — Service worker for caching and offline support.
- `manifest.webmanifest` — App name, display settings, and icon definitions.
- `icon.svg`, `icon-192.png`, `icon-512.png` — App icons.

## Run locally on Windows 11

A local HTTP server is recommended because service workers require a secure context, such as HTTPS or localhost. Opening `index.html` directly using a `file://` URL does not provide normal service-worker functionality.

1. Open the `tracker` folder.
2. Open a terminal in that folder.
3. Run:

   ```bash
   python -m http.server 8080
   ```

4. Open Chrome or Edge and visit:

   ```text
   http://localhost:8080
   ```

Keep the terminal running while using the local server.

Alternatively, use another local development server that supports the required functionality.

## Install on Android

To install the app on an Android phone, host the static files at an HTTPS address.

Suitable static hosting options include GitHub Pages, Netlify, and Cloudflare Pages.

1. Deploy the app files while preserving their relative paths.
2. Open the HTTPS address in Chrome on your phone.
3. Allow the app to load and cache its files.
4. Open the browser menu and select **Install app** or **Add to Home screen**, depending on the browser.

Installation options vary by browser and device.

**Important:** Do not publish personal backup JSON files or other private records with the website.

## Privacy, storage, and offline behavior

- Records are stored in the browser's `localStorage`.
- The app does not send records to a backend or synchronize them automatically.
- Hosting providers still deliver the static application files to the browser.
- The service worker caches the app shell and supports offline access.
- **Phone and laptop records are separate.** Export a backup on one device and restore it on the other to transfer records.
- Clearing browser/site data, resetting the browser, or losing a device can result in permanent data loss.

**Back up your records regularly.** Offline storage is not a substitute for a separate backup.

## Backup and restore

Use the Backup section to export or restore records.

### Export

Exporting creates a JSON file containing your app data.

- Keep the file private.
- The exported file is **not encrypted**.
- Anyone who obtains it may be able to read its contents.

### Restore

When restoring a backup, the app validates the file before replacing existing records.

Validation includes checks for data structure, unique IDs, valid calendar dates, supported amount precision, field length limits, and the file size limit.

Review the app's restore confirmation before proceeding. Keep a separate backup of important records before replacing your current data.

## Workout cycle rules

The workout schedule follows a repeating seven-day calendar cycle:

```text
Days 1–5: Workout days
Days 6–7: Rest days
```

The cycle day is calculated using:

```text
((days since cycle start) mod 7) + 1
```

Missing a day does not advance or reset the cycle independently.

Changing the cycle day for a selected date, after confirmation, realigns the cycle by changing its start date. Existing date-specific checklists and notes are retained.

A fresh installation starts with the current date as Day 1.

## Money calculations

The app tracks three transaction types:

- **Received:** Money received.
- **Spent:** Money spent.
- **Saved:** Money recorded as savings.

The remaining balance for a selected day is calculated as:

```text
Remaining = Received − Spent − Saved
```

Total recorded savings are calculated as:

```text
Total savings = Sum of all saved transactions
```

Amounts must be positive and have at most two decimal places. Calculations use paise to reduce floating-point rounding errors.

The remaining balance is a calculation from recorded transactions, not a connection to a real bank account.

## Error recovery

### Failed save

If storage is full or a save fails, the app displays an error instead of silently treating an unsaved change as successful. The failed change is rolled back where supported.

Export a backup, address the storage problem, and retry.

### Invalid or unreadable stored data

If the app detects invalid stored data, it can display a recovery screen instead of immediately overwriting the data.

Depending on the recovery options presented, you may be able to download the stored data, restore a valid backup, or explicitly reset the affected data.

A reset may preserve a copy of unreadable data under a separate storage key if sufficient space is available. This is not guaranteed, so do not rely on it as your only backup.

## Updating the app

Whenever you change a file included in the service worker's precache list:

1. Save the changed file.
2. Open `sw.js`.
3. Increment the cache version. For example:

   ```javascript
   const CACHE_VERSION = 'v3';
   ```

   Change it to:

   ```javascript
   const CACHE_VERSION = 'v4';
   ```

4. Deploy the updated files together.
5. Open the app and reload when the new service worker takes control.

The service worker removes older caches belonging to this app after the new worker activates. This does not intentionally clear the records stored in `localStorage`.

If the new worker fails to install because a precached file is missing or cannot be fetched, inspect the browser console for the error.

## Test offline functionality

### Desktop

1. Open the app online and wait for it to load.
2. Open Chrome or Edge DevTools.
3. Go to **Application → Service Workers**.
4. Enable offline simulation.
5. Reload the app and check its core sections.

### Android

1. Open the hosted app online and wait for it to load.
2. Enable airplane mode.
3. Reopen the installed app.
4. Check that the app interface and previously saved records remain accessible.

Offline behavior depends on the app files having been cached successfully beforehand.

## Manual testing checklist

- [ ] Add a college topic, reload the app, and verify that it remains saved.
- [ ] Complete a workout exercise, change the selected date, and verify that each date retains its own record.
- [ ] Add ₹500 received, ₹120 spent, and ₹100 saved for the same day. Verify a remaining balance of ₹280.00 and total recorded savings of ₹100.00, assuming no other relevant transactions.
- [ ] Export a backup, change some records, restore the backup, and verify the original records return.
- [ ] Try restoring an invalid file and confirm that existing records remain unchanged.
- [ ] Test the app after refreshing it.
- [ ] Test the core features offline after successful caching.
- [ ] Test the interface in both light and dark modes.
- [ ] Confirm that phone and laptop data remain separate unless transferred through backup and restore.

## Limitations

- No automatic cloud synchronization.
- No multi-user accounts or server-side database.
- Backups are readable JSON files, not encrypted archives.
- Clearing site data may erase locally stored records.
- Offline access requires successful caching of the app files.

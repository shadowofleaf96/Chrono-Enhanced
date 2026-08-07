# Chrono Enhanced

**Chrono Enhanced** is a Chrome extension designed to streamline and improve operations on the Chronodiali platform (`cross.chronodiali.ma`). It introduces several quality-of-life features, automations, and UI enhancements directly into the platform's workflow.

## Features

### 📦 Parcel Status Tracking in Outscan
- Automatically watches the Outscan modal table for CN numbers.
- Fetches real-time parcel status using a hidden iframe.
- Injects a new **Status** column directly into the table.
- Displays a mini-timeline showing up to the 3 most recent log entries with color-coded status dots.

### 🔔 Reconciliation Toast Notifications
- On the reconciliation page, monitors for the "Settlement Done!" message.
- Displays a prominent toast notification reminding operators to click the **"Réglé"** button.

### ⚡ Quick "Inscan at Hub" Modal
- Injects a custom **"Inscan at Hub"** button on the reconciliation page (next to Reconcile/Cancel).
- Clicking the button seamlessly opens the scanner in a modal overlay, removing unnecessary page layout elements for a focused scanning experience.

### 🎯 Auto-set Default Filters
- Automatically configures default search filters when navigating to the Consignments page:
  - **Hub**: Mohammedia
  - **Date Type**: Last Event Time
  - **Date Range**: Last 60 days

### ✅ Verify Completed Trips (Rider List)
- Injects a **Verify Completed Trips** button on the Rider List page (`/ops/reconciliation/rider-list`).
- Fetches the Trip Manager page in the background to find riders who have finished their trips.
- Prepend a small `✔` badge next to the rider's name dynamically without breaking table layouts.

### 🎨 UI & UX Improvements
- Widens the default scan modals to comfortably fit the new status timelines.
- Adds loading spinners, visual cues, and error handling for iframe fetches.
- Ensures smooth operation even on React SPA (Single Page Application) route changes.

## Changelog

### Recent Updates
- **Feature**: Added "Verify Completed Trips" synchronization on the Rider List page to flag finished riders instantly with a `✔` badge.
- **Fix**: Redesigned Parcel Status tracking to inject timelines directly *inside* the existing reference cell. This completely prevents React virtual DOM crashes and scrolling bugs that happened when injecting new columns.
- **Fix**: Resolved an issue where previously scanned parcels would get stuck on "Loading..." when React refreshed the table by instantly restoring timelines from the extension's memory cache.
- **UI**: Made log times visually smaller and shortened long parenthetical reasons in status text for maximum horizontal space.

## Installation

Since this extension is designed for a specific internal platform, it can be installed manually in Developer Mode:

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button in the top left.
5. Select the `ChronoExtension` directory.
6. The extension is now installed and will automatically activate on `https://cross.chronodiali.ma/ops*`.

## Permissions
- `activeTab`: Required to inject scripts and styles into the active Chronodiali tab.
- `https://cross.chronodiali.ma/*`: Host permission required to interact with the platform's pages and make hidden iframe requests for parcel status fetching.

## Technologies Used
- **JavaScript (Vanilla)**: For content script logic, DOM manipulation, and React component interaction.
- **CSS**: For custom styling, badges, timelines, and modal overlays.
- **Manifest V3**: Compliant with the latest Chrome Extension standards.

## License
Internal tool for Chronodiali operations.

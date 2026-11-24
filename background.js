/* ============================================================
   Chrono Enhanced — Background Service Worker
   Service worker for Chrome Extension Manifest V3.
   ============================================================ */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ChronoExt] Extension installed / updated.');
});

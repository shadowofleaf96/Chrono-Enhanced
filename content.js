/* ============================================================
   Chrono Parcel Status — Content Script
   Watches the Outscan modal table for CN numbers and fetches
   their status from the detail page via hidden iframe (since
   the site is a React SPA), then injects a Status column.
   ============================================================ */

(() => {
  "use strict";

  // ── Config ────────────────────────────────────────────────
  const BASE_URL = "https://cross.chronodiali.ma/ops/details/";
  const IFRAME_TIMEOUT = 35000;        // ms – max wait for iframe to render
  const IFRAME_POLL = 300;             // ms – how often to poll iframe DOM
  const MAX_CONCURRENT = 4;            // max simultaneous iframe fetches
  const ATTR_PROCESSED = "data-chrono-status-processed";

  // ── Inject Interceptor ────────────────────────────────────
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('intercept.js');
  (document.head || document.documentElement).appendChild(script);

  let apiTokens = null;
  try {
    const savedTokens = localStorage.getItem('chrono_api_tokens');
    if (savedTokens) {
      apiTokens = JSON.parse(savedTokens);
    }
  } catch(_) {}

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'CHRONO_TOKENS') {
      apiTokens = event.data.tokens;
      console.log('🔑 [ChronoExt] Tokens de session capturés:', apiTokens);
      try {
        localStorage.setItem('chrono_api_tokens', JSON.stringify(apiTokens));
      } catch(_) {}
    }
    if (event.data.type === 'CHRONO_API_INTERCEPT') {
      const p = event.data.payload;
      if (p.url.includes('getReconciliationData')) {
        localStorage.setItem('chrono_api_getReconciliationData', JSON.stringify(p));
      } else if (p.url.includes('transactionsHistory') || p.url.includes('Transaction') || p.url.includes('transaction')) {
        localStorage.setItem('chrono_api_transactions', JSON.stringify(p));
      }
    }
  });

  // ── Status cache (CN → array of {status, color, time}) ────
  const statusCache = new Map();
  const LOG_ENTRIES_COUNT = 3;          // how many recent logs to show

  // ── Concurrency control ───────────────────────────────────
  let activeIframes = 0;
  const fetchQueue = [];

  function enqueueFetch(cnCode) {
    return new Promise((resolve) => {
      fetchQueue.push({ cnCode, resolve });
      drainQueue();
    });
  }

  function drainQueue() {
    while (activeIframes < MAX_CONCURRENT && fetchQueue.length > 0) {
      const { cnCode, resolve } = fetchQueue.shift();
      activeIframes++;
      fetchViaIframe(cnCode).then((result) => {
        activeIframes--;
        resolve(result);
        drainQueue();
      });
    }
  }

  // ── API-based status fetcher ───────────────────────────

  function getStatusColor(type) {
    type = (type || "").toLowerCase();
    if (type === "delivered") return "#52c41a"; // green
    if (type === "attempted" || type.includes("undelivered")) return "#ff4d4f"; // red
    if (type.includes("out_for_delivery") || type === "accept") return "#fa8c16"; // orange
    if (type.includes("hub")) return "#1890ff"; // blue
    if (type === "reschedule") return "#fadb14"; // yellow
    return "#d9d9d9"; // gray
  }

  function formatTime(timestamp) {
    if (!timestamp) return "";
    const d = new Date(timestamp);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${m} ${h}:${min}`;
  }

  async function fetchViaIframe(cnCode) { // Kept name for queue compatibility
    if (statusCache.has(cnCode)) {
      return statusCache.get(cnCode);
    }
    if (!apiTokens) {
      console.warn("[ChronoExt] API tokens not captured yet. Retrying in 1s...");
      await new Promise(r => setTimeout(r, 1000));
      if (!apiTokens) return [{ status: "Auth Error", color: "#ef4444", time: "" }];
    }

    try {
      const url = `https://projectxeuapi.shipsy.io/api/CRMDashboard/consignments/fetchOne?referenceNumber=${cnCode}&send_unmasked_data=false`;
      const response = await fetch(url, {
        method: "GET",
        headers: apiTokens
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const json = await response.json();
      
      // Try to find events and attempt_count in various possible Shipsy response structures
      let events = json.events || [];
      let attemptCount = json.attempt_count || 0;
      
      // If the response is an array, take the first element
      let dataObj = json;
      if (Array.isArray(json) && json.length > 0) {
        dataObj = json[0];
        events = dataObj.events || [];
        attemptCount = dataObj.attempt_count || 0;
      }
      
      if (events.length === 0 && dataObj.data) {
        if (dataObj.data.events) {
          events = dataObj.data.events;
        } else if (dataObj.data.pieces_detail && dataObj.data.pieces_detail.length > 0) {
          events = dataObj.data.pieces_detail[0].events || [];
          attemptCount = dataObj.data.pieces_detail[0].attempt_count || attemptCount;
        } else {
          events = dataObj.data.tracking_history || [];
        }
      }

      console.log(`[ChronoExt] Parsed API Data for ${cnCode}:`, { events, attemptCount, raw: json });

      if (!events || events.length === 0) {
        const entries = [{ status: "No Data", color: "#d9d9d9", time: "" }];
        entries.attempts = attemptCount;
        statusCache.set(cnCode, entries);
        return entries;
      }

      const entries = [];
      entries.attempts = attemptCount;

      for (let i = 0; i < Math.min(events.length, LOG_ENTRIES_COUNT); i++) {
        const ev = events[i];
        const status = ev.event_string || "Unknown";
        
        let fullStatus = status;
        if (ev.reason) {
          fullStatus += ` - ${ev.reason}`;
        }
        if (ev.hub_name) {
          fullStatus += ` - ${ev.hub_name}`;
        }
        
        entries.push({
          status: status.substring(0, 50),
          fullStatus: fullStatus,
          color: getStatusColor(ev.type),
          time: formatTime(ev.event_time)
        });
      }

      statusCache.set(cnCode, entries);
      return entries;

    } catch (err) {
      console.error(`[ChronoExt] API fetch error for ${cnCode}:`, err);
      const entries = [{ status: "Error", color: "#ef4444", time: "" }];
      statusCache.set(cnCode, entries);
      return entries;
    }
  }

  // ── Public fetch (with cache + queue) ─────────────────────

  async function fetchParcelStatus(cnCode) {
    if (statusCache.has(cnCode)) return statusCache.get(cnCode);
    return enqueueFetch(cnCode);
  }

  // ── Badge / timeline builder ───────────────────────────────

  function createLoadingBadge() {
    const badge = document.createElement("div");
    badge.className = "chrono-ext-status-badge";
    badge.innerHTML = `
      <span class="chrono-ext-spinner"></span>
      <span class="chrono-ext-status-text">Loading…</span>
    `;
    return badge;
  }

  /**
   * Build a mini-timeline showing up to 3 recent log entries.
   * @param {Array<{status, color, time}>} entries
   */
  function createStatusTimeline(entries) {
    const container = document.createElement("div");
    container.className = "chrono-ext-status-timeline";
    
    if (entries.attempts && entries.attempts !== '0') {
      const attemptsBadge = document.createElement("div");
      attemptsBadge.className = "chrono-ext-attempts-badge";
      attemptsBadge.innerHTML = `Attempts: <strong>${entries.attempts}</strong>`;
      container.appendChild(attemptsBadge);
    }

    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "chrono-ext-log-entry";

      // Error/timeout badge fallback
      if (entry.status === "Error" || entry.status === "Timeout") {
        const badge = document.createElement("div");
        badge.className = "chrono-ext-status-badge";
        badge.setAttribute("data-error", "true");
        badge.innerHTML = `
          <span class="chrono-ext-status-dot" style="background:${entry.color}"></span>
          <span class="chrono-ext-status-text">${entry.status}</span>
        `;
        container.appendChild(badge);
        continue;
      }

      const dot = document.createElement("span");
      dot.className = "chrono-ext-log-dot";
      dot.style.backgroundColor = entry.color;

      const content = document.createElement("div");
      content.className = "chrono-ext-log-content";

      const statusEl = document.createElement("span");
      statusEl.className = "chrono-ext-log-status";
      statusEl.title = "Click to toggle full text";
      
      // Shorten status by removing text inside parentheses, e.g., "(Reason - ...)"
      let shortStatus = entry.status.replace(/\s*\(.*?\)/g, '').trim();
      let fullStatus = entry.fullStatus || entry.status;
      statusEl.textContent = shortStatus;

      let isExpanded = false;
      row.style.cursor = "pointer";
      row.title = "Click to toggle full text";
      
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log("[ChronoExt] Status clicked, expanding:", !isExpanded);
        isExpanded = !isExpanded;
        if (isExpanded) {
          statusEl.textContent = fullStatus;
          statusEl.classList.add("expanded");
        } else {
          statusEl.textContent = shortStatus;
          statusEl.classList.remove("expanded");
        }
      });

      content.appendChild(statusEl);

      if (entry.time) {
        const timeEl = document.createElement("span");
        timeEl.className = "chrono-ext-log-time";
        timeEl.textContent = entry.time;
        content.appendChild(timeEl);
      }

      row.appendChild(dot);
      row.appendChild(content);
      container.appendChild(row);
    }

    return container;
  }

  // ── Modal detection ───────────────────────────────────────

  /**
   * Find any open modal that has a CN scan table
   */
  // ── 1. Identify the scan modal ──────────────────────────────
  // The modal wrapper has class `.ant-modal-content`
  function getScanModal(doc = document) {
    const modals = doc.querySelectorAll(".ant-modal-content");
    for (const modal of modals) {
      // Look for modals with a CN scan input and a table
      const scanInput = modal.querySelector('input[placeholder*="CN"], input[placeholder*="Add consignments"]');
      const table = modal.querySelector(".ant-table");
      if (scanInput && table) return modal;

      // Also match by title
      const title = modal.querySelector(".ant-modal-title");
      if (title) {
        const t = title.textContent.trim().toLowerCase();
        if (t.includes("scan") && table) return modal;
      }
    }
    return null;
  }

  // ── Column injection & modal resize ────────────────────────

  function widenModal(modal) {
    // Walk up to the .ant-modal wrapper and force it wider
    let el = modal;
    while (el && !el.classList.contains("ant-modal")) {
      el = el.parentElement;
    }
    if (el && !el.hasAttribute("data-chrono-widened")) {
      el.setAttribute("data-chrono-widened", "true");
      el.style.width = "1150px";
      el.style.maxWidth = "95vw";
    }
  }

  // We intentionally do NOT modify the table headers or colgroups anymore.
  // Modifying React-controlled columns (<th>, <colgroup>) crashes the app 
  // when it tries to re-render, preventing new scans from appearing.

  // ── Import Excel button ────────────────────────────────────

  function ensureImportExcelButton(modal) {
    if (modal.querySelector('.chrono-ext-import-btn')) return;

    const scanInput = modal.querySelector('input[placeholder*="CN"], input[placeholder*="Add consignments"]');
    if (!scanInput) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls, .csv';
    fileInput.style.display = 'none';
    
    const btn = document.createElement('button');
    btn.className = 'chrono-ext-import-btn';
    btn.textContent = 'Import Excel';
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async function(evt) {
        try {
          const data = evt.target.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          const modalTitleEl = modal.querySelector('.ant-modal-title');
          const modalTitle = modalTitleEl ? modalTitleEl.textContent.toLowerCase() : '';
          const isOutscan = modalTitle.includes('outscan');
          
          let codes = [];
          // Start from row 6 (index 5)
          for (let i = 5; i < rows.length; i++) {
            let row = rows[i];
            if (!row) continue;
            
            // If Outscan, grab from all columns. Otherwise (Inscan, Set RTO, etc), grab only Column A (index 0)
            const columnsToRead = isOutscan ? row.length : 1;
            
            for (let j = 0; j < columnsToRead; j++) {
              let val = row[j];
              if (val && typeof val === 'string') {
                let trimmed = val.trim();
                let upper = trimmed.toUpperCase();
                
                // Exclude specific strings and check length
                if (trimmed.length > 5 && 
                    !upper.includes("ACCUSE FUTURAMA EXPRESS") && 
                    !upper.includes("ACCUSE CHRONODIALI")) {
                  codes.push(trimmed);
                }
              }
            }
          }
          
          if (codes.length > 0) {
            const originalText = btn.textContent;
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.7';
            
            for (let k = 0; k < codes.length; k++) {
              btn.textContent = `Importing (${k + 1}/${codes.length})...`;
              
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(scanInput, codes[k]);
              } else {
                scanInput.value = codes[k];
              }
              
              scanInput.dispatchEvent(new Event('input', { bubbles: true }));
              scanInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
              });
              scanInput.dispatchEvent(enterEvent);
              
              await new Promise(r => setTimeout(r, 400));
            }
            
            btn.textContent = originalText;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
          } else {
            alert('No tracking codes found in row 6 or below.');
          }
        } catch (err) {
          console.error('[ChronoExt] Error parsing Excel', err);
          alert('Error parsing Excel file. Please make sure it is a valid spreadsheet.');
        }
        fileInput.value = '';
      };
      reader.readAsBinaryString(file);
    });
    
    const wrapper = scanInput.closest('.ant-space-item') || scanInput.parentElement;
    wrapper.appendChild(fileInput);
    
    // Add button directly after the input wrapper if possible, or append to parent
    if (scanInput.closest('.ant-input-affix-wrapper')) {
      const affix = scanInput.closest('.ant-input-affix-wrapper');
      affix.parentNode.insertBefore(btn, affix.nextSibling);
    } else {
      wrapper.appendChild(btn);
    }
  }

  // ── Row processing ────────────────────────────────────────

  function processTableRows(modal) {
    const tbody = modal.querySelector(".ant-table-tbody");
    if (!tbody) return;

    for (const row of tbody.querySelectorAll("tr")) {
      if (row.classList.contains("ant-table-measure-row") || row.classList.contains("ant-table-placeholder")) {
        continue;
      }

      const tds = Array.from(row.querySelectorAll("td.ant-table-cell"));
      if (tds.length < 2) continue;

      const cnTd = tds[1];
      
      // Don't read our own injected text if we are re-processing
      // We extract the pure text content of the cell minus our container if it exists
      const clone = cnTd.cloneNode(true);
      const existingContainer = clone.querySelector(".chrono-ext-status-container");
      if (existingContainer) existingContainer.remove();
      
      const rawText = clone.textContent || "";
      const cnCodeMatch = rawText.match(/[a-zA-Z0-9_-]+/);
      const cnCode = cnCodeMatch ? cnCodeMatch[0] : "";
      if (!cnCode) continue;

      // Detect if React recycled this row for a different parcel
      const currentCn = row.getAttribute("data-chrono-cn");
      if (currentCn !== cnCode) {
        row.setAttribute("data-chrono-cn", cnCode);
        row.removeAttribute(ATTR_PROCESSED);
      }

      // Check for our status container inside the cell
      let statusContainer = cnTd.querySelector(".chrono-ext-status-container");
      let newlyCreated = false;
      
      if (!statusContainer) {
        // Ensure the cell uses flex layout so the CN number and our timeline sit side-by-side
        cnTd.style.display = "flex";
        cnTd.style.alignItems = "center";
        cnTd.style.justifyContent = "space-between";
        cnTd.style.gap = "16px";
        cnTd.style.minWidth = "600px"; // give it room to breathe

        statusContainer = document.createElement("div");
        statusContainer.className = "chrono-ext-status-container";
        // We use flex: 1 here so it takes remaining space without pushing the CN text out
        statusContainer.style.flex = "1";
        statusContainer.style.minWidth = "0";
        cnTd.appendChild(statusContainer);
        newlyCreated = true;
      }

      // If we just recreated the container (due to React re-render) OR it's a completely new row
      if (newlyCreated || !row.hasAttribute(ATTR_PROCESSED)) {
        statusContainer.innerHTML = "";
        
        if (statusCache.has(cnCode)) {
          // Instantly restore from cache if React wiped it out
          statusContainer.appendChild(createStatusTimeline(statusCache.get(cnCode)));
          row.setAttribute(ATTR_PROCESSED, "true");
        } else {
          // Show loading state
          statusContainer.appendChild(createLoadingBadge());
          
          // Only trigger a new fetch if one hasn't been started for this row
          if (!row.hasAttribute(ATTR_PROCESSED)) {
            row.setAttribute(ATTR_PROCESSED, "true");
            
            fetchParcelStatus(cnCode).then((entries) => {
              // Verify this row is still showing the same CN code before updating
              if (row.getAttribute("data-chrono-cn") === cnCode) {
                let currentContainer = row.querySelector(".chrono-ext-status-container");
                if (currentContainer) {
                  currentContainer.innerHTML = "";
                  currentContainer.appendChild(createStatusTimeline(entries));
                }
              }
            });
          }
        }
      }
    }
  }

  // ── Toast Notification for Reconciliation Page ──────────────

  let toastShownForUrl = null;

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "chrono-ext-toast";
    toast.innerHTML = `
      <div class="chrono-ext-toast-icon">⚠️</div>
      <div class="chrono-ext-toast-content">${message}</div>
      <div class="chrono-ext-toast-close">×</div>
    `;
    document.body.appendChild(toast);
    
    const closeBtn = toast.querySelector(".chrono-ext-toast-close");
    closeBtn.addEventListener("click", () => {
      toast.remove();
    });
  }

  function checkReconciliationToast() {
    if (!location.pathname.includes("/ops/reconciliation/recon/")) {
      toastShownForUrl = null; // Reset if they leave the page
      
      // Forcibly remove any active toast if they navigate away
      const existingToast = document.querySelector('.chrono-ext-toast');
      if (existingToast) {
        existingToast.remove();
      }
      
      return;
    }
    
    // If we already showed it for this specific recon page, skip
    if (toastShownForUrl === location.href) return;

    // Check if "Settlement Done!" is anywhere on the page
    const pageText = document.body.innerText || "";
    if (pageText.includes("Settlement Done!")) {
      showToast('N\'oubliez pas de cliquer sur le bouton "Réglé" !');
      toastShownForUrl = location.href;
    }
  }

  // ── Custom Inscan at Hub Modal Logic ────────────────────────

  function hideInscanOverlay(triggerReload = true) {
    const overlay = document.querySelector('.chrono-iframe-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
    }
    if (triggerReload) {
      setTimeout(() => {
        const reloadBtn = document.querySelector('button .anticon-reload')?.closest('button');
        if (reloadBtn) {
          reloadBtn.click();
        }
      }, 300);
    }
  }

  function showInscanOverlay() {
    const overlay = document.querySelector('.chrono-iframe-overlay');
    if (overlay) {
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
      if (overlay.dataset.ready === 'true') {
        const loadingEl = overlay.querySelector('.chrono-iframe-loading');
        if (loadingEl) loadingEl.style.display = 'none';
        const iframe = overlay.querySelector('#chrono-inscan-iframe');
        if (iframe) iframe.style.opacity = '1';
      }
    }
  }
  
  function preloadInscanModal(showImmediately = false) {
    const existing = document.querySelector('.chrono-iframe-overlay');
    if (existing) {
      if (showImmediately) showInscanOverlay();
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'chrono-iframe-overlay';
    // Hidden during preload — opacity:0 lets the iframe actually render in background
    if (!showImmediately) {
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
    }
    overlay.dataset.ready = 'false';
    overlay.innerHTML = `
      <div class="chrono-iframe-loading">Loading Scanner...</div>
      <iframe id="chrono-inscan-iframe" src="/ops/consignments"></iframe>
    `;
    document.body.appendChild(overlay);

    const iframe = overlay.querySelector('#chrono-inscan-iframe');
    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) {
          console.warn("[ChronoExt] iframe.contentDocument is null (iframe may still be navigating). Skipping this onload.");
          return;
        }
        
        // Hide standard layout elements so it feels like a modal
        const style = doc.createElement('style');
        style.id = "chrono-iframe-style";
        style.textContent = `
          header, .ant-layout-header, .ant-layout-sider, .top-bar, .ant-pro-sider { display: none !important; }
          .ant-layout, .ant-layout-content { margin: 0 !important; padding: 0 !important; background: transparent !important; }
          body { background: transparent !important; }
        `;
        doc.head.appendChild(style);
        
        // Try to find and click the Inscan button -> then 'Selected'
        let attempts = 0;
        let step = 0;
        
        const checkInterval = setInterval(() => {
          attempts++;
          
          const modal = doc.querySelector('.ant-modal-content');
          if (modal) {
            clearInterval(checkInterval);
            overlay.querySelector('.chrono-iframe-loading').style.display = 'none';
            iframe.style.opacity = '1';
            overlay.dataset.ready = 'true';
            

            // Apply UI updates to the modal immediately
            tick(doc);
            
            // Intercept close button (X), Cancel button, and mask clicks using event delegation
            // so they just HIDE our overlay instead of letting React destroy the modal
            if (!doc.documentElement.dataset.chronoCloseIntercepted) {
              doc.documentElement.dataset.chronoCloseIntercepted = 'true';
              doc.addEventListener('click', (e) => {
                const closeBtn = e.target.closest('.ant-modal-close');
                let isCancel = false;
                const btn = e.target.closest('button');
                if (btn && btn.textContent.trim() === 'Cancel' && btn.closest('.ant-modal-footer')) {
                  isCancel = true;
                }
                const wrap = e.target.closest('.ant-modal-wrap');
                const isMaskClick = wrap && e.target === wrap;

                if (closeBtn || isCancel || isMaskClick) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                  hideInscanOverlay();
                }
              }, true); // capture phase to beat React
            }
            
            // Also watch for DOM changes to keep tick() running for new scanned parcels
            const modalObserverForTick = new MutationObserver(() => {
              tick(doc);
            });
            modalObserverForTick.observe(modal, { childList: true, subtree: true });
            
            return;
          }

          if (step === 0) {
            const buttons = Array.from(doc.querySelectorAll('button, .ant-btn, [role="button"]'));
            const inscanBtn = buttons.find(b => {
              const text = b.textContent.toLowerCase();
              return (text.includes('inscan') || text.includes('in scan')) && !b.closest('.ant-modal');
            });
            
            if (inscanBtn) {
              inscanBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
              inscanBtn.click();
              step = 1;
            }
          } else if (step === 1) {
            const allEls = Array.from(doc.querySelectorAll('li, span, div, a'));
            const selectedTextNode = allEls.find(el => el.children.length === 0 && el.textContent.trim().toLowerCase() === 'selected');
            
            if (selectedTextNode) {
              const clickable = selectedTextNode.closest('.ant-dropdown-menu-item, li, [role="menuitem"]') || selectedTextNode;
              clickable.click();
              ['mousedown', 'mouseup', 'click'].forEach(evt => {
                clickable.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: iframe.contentWindow }));
              });
              step = 2;
            } else if (attempts % 6 === 0) {
              step = 0;
            }
          }
          
          if (attempts > 30) { 
            clearInterval(checkInterval);
            style.remove();
            overlay.querySelector('.chrono-iframe-loading').style.display = 'none';
            iframe.style.opacity = '1';
            overlay.dataset.ready = 'true';
          }
        }, 500);
      } catch (e) {
        console.error("[ChronoExt] Error accessing iframe:", e);
        overlay.querySelector('.chrono-iframe-loading').innerHTML = 'Error loading scanner. (Cross-origin or network issue)';
      }
    };
  }

  function getActiveReconciliationTab() {
    // 1. Ant Design tab headers check
    const tabElements = Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]'));
    for (const tab of tabElements) {
      const isActive = tab.classList.contains('ant-tabs-tab-active') ||
                       tab.getAttribute('aria-selected') === 'true' ||
                       tab.classList.contains('active');
      if (isActive) {
        const text = tab.textContent.toLowerCase();
        if (text.includes('consignment') || text.includes('colis') || text.includes('envoi')) {
          return 'consignment';
        }
        if (text.includes('cash') && !text.includes('non-cash') && !text.includes('consignment')) {
          return 'cash';
        }
        if (text.includes('non-cash') || text.includes('non cash')) {
          return 'non-cash';
        }
      }
    }

    // 2. Visible tabpane check in DOM
    const tabPanes = Array.from(document.querySelectorAll('.ant-tabs-tabpane, [role="tabpanel"]'));
    for (const pane of tabPanes) {
      const isHidden = pane.classList.contains('ant-tabs-tabpane-hidden') ||
                       pane.getAttribute('aria-hidden') === 'true' ||
                       pane.offsetParent === null;
      if (!isHidden) {
        const text = pane.textContent.toLowerCase();
        if (text.includes('cns scanned') || text.includes('scan waybills') || pane.querySelector('input[placeholder*="Waybill" i]')) {
          return 'consignment';
        }
        if (text.includes('cash balance') || text.includes('denomination')) {
          return 'cash';
        }
      }
    }

    // 3. Directly visible Scan Waybills input check
    const waybillInput = document.querySelector('input[placeholder*="Scan Waybill" i], input[placeholder*="Waybill" i]');
    if (waybillInput && waybillInput.offsetParent !== null) {
      const rect = waybillInput.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return 'consignment';
      }
    }

    return null;
  }

  function isConsignmentTabActive() {
    return getActiveReconciliationTab() === 'consignment';
  }

  function ensureInscanButton() {
    if (!location.pathname.includes("/ops/reconciliation")) return;
    if (location.pathname.includes("/ops/reconciliation/rider-list")) return;

    // Attach click listeners to tabs so tab switches instantly trigger update
    const tabHeaders = document.querySelectorAll('.ant-tabs-tab, [role="tab"]');
    tabHeaders.forEach(tab => {
      if (!tab.dataset.chronoInscanTabListener) {
        tab.dataset.chronoInscanTabListener = 'true';
        tab.addEventListener('click', () => {
          setTimeout(ensureInscanButton, 30);
          setTimeout(ensureInscanButton, 100);
          setTimeout(ensureInscanButton, 300);
          setTimeout(ensureInscanButton, 600);
        });
      }
    });

    // STRICT: If NOT on the Consignment Balance tab (e.g. Cash Balance or Non-Cash Balance), remove button immediately
    if (!isConsignmentTabActive()) {
      document.querySelectorAll('.chrono-inscan-ext-btn').forEach(btn => btn.remove());
      return;
    }

    // Locate the active Consignment tab pane or row
    const activePane = Array.from(document.querySelectorAll('.ant-tabs-tabpane, [role="tabpanel"]')).find(pane => {
      const isHidden = pane.classList.contains('ant-tabs-tabpane-hidden') ||
                       pane.getAttribute('aria-hidden') === 'true' ||
                       pane.offsetParent === null;
      if (isHidden) return false;
      return pane.textContent.includes('CNS Scanned') ||
             pane.textContent.includes('Scan Waybills') ||
             pane.querySelector('input[placeholder*="Waybill" i]') !== null;
    });

    const waybillInput = document.querySelector('input[placeholder*="Scan Waybill" i], input[placeholder*="Waybill" i]');

    // Find the target Cancel / Reconcile button strictly within the active consignment pane/row
    let targetAnchorBtn = null;

    if (activePane) {
      const paneButtons = Array.from(activePane.querySelectorAll('button, .ant-btn, [role="button"]'))
        .filter(b => b.offsetParent !== null);
      targetAnchorBtn = paneButtons.find(b => {
        const text = b.textContent.trim().toLowerCase();
        return text === 'cancel' || text === 'annuler';
      }) || paneButtons.find(b => {
        const text = b.textContent.trim().toLowerCase();
        return text === 'reconcile' || text === 'settle' || text.includes('reconcil');
      });
    }

    if (!targetAnchorBtn && waybillInput && waybillInput.offsetParent !== null) {
      const scanRow = waybillInput.closest('.row, .ant-row, .d-flex, form') || waybillInput.parentElement?.parentElement;
      if (scanRow) {
        const rowButtons = Array.from(scanRow.querySelectorAll('button, .ant-btn, [role="button"]'))
          .filter(b => b.offsetParent !== null);
        targetAnchorBtn = rowButtons.find(b => {
          const text = b.textContent.trim().toLowerCase();
          return text === 'cancel' || text === 'annuler' || text === 'reconcile' || text.includes('reconcil');
        });
      }
    }

    if (targetAnchorBtn && targetAnchorBtn.parentElement) {
      const container = targetAnchorBtn.parentElement;
      
      // If already positioned right before targetAnchorBtn, we are good
      if (targetAnchorBtn.previousElementSibling && targetAnchorBtn.previousElementSibling.classList.contains('chrono-inscan-ext-btn')) {
        return;
      }

      // Remove any duplicate or stray buttons elsewhere
      document.querySelectorAll('.chrono-inscan-ext-btn').forEach(btn => btn.remove());

      const inscanBtn = document.createElement('button');
      inscanBtn.type = "button";
      inscanBtn.className = "ant-btn ant-btn-primary chrono-inscan-ext-btn";
      inscanBtn.style.background = "#1890ff";
      inscanBtn.style.borderColor = "#1890ff";
      inscanBtn.style.color = "#ffffff";
      inscanBtn.style.fontWeight = "bold";
      inscanBtn.style.marginRight = "8px";
      inscanBtn.innerHTML = `<span>📥 Inscan at Hub</span>`;
      
      container.insertBefore(inscanBtn, targetAnchorBtn);
      
      inscanBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const overlay = document.querySelector('.chrono-iframe-overlay');
        if (overlay) {
          showInscanOverlay();
        } else {
          preloadInscanModal(true);
        }
      });
    }
  }

  // ── Verify Completed Trips (Rider List) ─────────────────────

  function ensureVerifyCompletedButton() {
    if (!location.pathname.includes("/ops/reconciliation/rider-list")) return;

    // Find the Reset All button to place ours next to it
    const buttons = Array.from(document.querySelectorAll('button'));
    const resetBtn = buttons.find(b => b.textContent.trim() === 'Reset All');
    
    if (resetBtn && !document.querySelector('.chrono-ext-verify-btn')) {
      const container = resetBtn.parentElement;
      const verifyBtn = document.createElement('button');
      
      // Copy classes for consistent sizing, then add our custom class
      verifyBtn.className = resetBtn.className + " chrono-ext-verify-btn";
      verifyBtn.innerHTML = `
        <span class="chrono-ext-spinner" style="display:none;"></span>
        <span>Verify Completed Trips</span>
      `;
      
      // Insert right after the reset button
      if (resetBtn.nextSibling) {
        container.insertBefore(verifyBtn, resetBtn.nextSibling);
      } else {
        container.appendChild(verifyBtn);
      }

      verifyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (verifyBtn.classList.contains('is-loading')) return;
        
        verifyBtn.classList.add('is-loading');
        verifyBtn.querySelector('.chrono-ext-spinner').style.display = 'inline-block';
        verifyBtn.querySelector('span:not(.chrono-ext-spinner)').textContent = "Fetching...";

        try {
          const completedRiders = await fetchCompletedRiders();
          
          // Apply badges to the Rider List table
          const tbody = document.querySelector('.ant-table-tbody');
          if (tbody) {
            const rows = tbody.querySelectorAll('tr.ant-table-row');
            let matchCount = 0;
            rows.forEach(row => {
              const cells = row.querySelectorAll('td.ant-table-cell');
              if (cells.length >= 2) {
                // Rider Name is usually in the 2nd cell in Rider List
                const riderName = cells[1].textContent.trim();
                
                // Case-insensitive match just to be safe
                const isCompleted = Array.from(completedRiders).some(
                  r => r.toLowerCase() === riderName.toLowerCase()
                );
                
                if (isCompleted && !cells[1].querySelector('.chrono-ext-rider-badge')) {
                  const badge = document.createElement('span');
                  badge.className = 'chrono-ext-rider-badge';
                  badge.innerHTML = '&#10004;'; // checkmark character
                  
                  // Prepend before the name to ensure it's always visible (bypasses overflow:hidden)
                  const innerDiv = cells[1].querySelector('div');
                  if (innerDiv) {
                     innerDiv.style.display = "flex";
                     innerDiv.style.alignItems = "center";
                     innerDiv.insertBefore(badge, innerDiv.firstChild);
                  } else {
                     cells[1].insertBefore(badge, cells[1].firstChild);
                  }
                  matchCount++;
                }
              }
            });
            verifyBtn.querySelector('span:not(.chrono-ext-spinner)').textContent = `Verified (${matchCount} found)`;
          } else {
             verifyBtn.querySelector('span:not(.chrono-ext-spinner)').textContent = "Table not found";
          }
        } catch (err) {
          console.error("[ChronoExt] Error fetching completed riders:", err);
          verifyBtn.querySelector('span:not(.chrono-ext-spinner)').textContent = "Error fetching";
        } finally {
          verifyBtn.classList.remove('is-loading');
          verifyBtn.querySelector('.chrono-ext-spinner').style.display = 'none';
          
          // Reset text after 5 seconds
          setTimeout(() => {
             if (!verifyBtn.classList.contains('is-loading')) {
                verifyBtn.querySelector('span:not(.chrono-ext-spinner)').textContent = "Verify Completed Trips";
             }
          }, 5000);
        }
      });
    }
  }


  async function fetchCompletedRiders() {
    if (!apiTokens) {
      console.warn("[ChronoExt] API tokens not captured yet. Cannot fetch completed riders.");
      throw new Error("No API tokens available. Please refresh the page and try again.");
    }

    const completedRiders = new Set();
    const url = "https://projectxeuapi.shipsy.io/api/retaildashboard/tripmanager/get";
    
    try {
      // 1. Calculate fallback (today)
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      let fromDate = todayStr;
      let toDate = todayStr;

      // 2. Try to extract date range from the Ant Design date picker on the page
      try {
        const inputs = document.querySelectorAll('.ant-picker-input input');
        if (inputs && inputs.length >= 2) {
          const startVal = inputs[0].value;
          const endVal = inputs[1].value;
          
          // Helper to convert DD-MM-YYYY or DD/MM/YYYY to YYYY-MM-DD if needed
          const parseDate = (str) => {
            if (!str) return null;
            // If already YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
            // If DD-MM-YYYY or DD/MM/YYYY
            const match = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
            if (match) return `${match[3]}-${match[2]}-${match[1]}`;
            return null;
          };

          const parsedStart = parseDate(startVal);
          const parsedEnd = parseDate(endVal);

          if (parsedStart && parsedEnd) {
            fromDate = parsedStart;
            toDate = parsedEnd;
          }
        }
      } catch (e) {
        console.warn("[ChronoExt] Could not extract date from page, using today:", e);
      }

      // Exact payload from Shipsy Network tab
      const payload = {
        "last_trip_id": null,
        "last_sort_field_value": null,
        "result_per_page": 200, // increased to ensure we get all trips
        "next_or_prev": "first",
        "sort_by": "last_main_event_time",
        "descending_order": true,
        "from_date": fromDate,
        "to_date": toDate,
        "date_field": "last_main_event_time",
        "organisation_reference_number": "",
        "hub_id": "2477050730750414061", // Using the one captured from network tab
        "bucket": "retail_completed",
        "timezone": "Africa/Casablanca"
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...apiTokens,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const json = await response.json();
      
      let pageData = [];
      if (json && json.data && Array.isArray(json.data.page_data)) {
        pageData = json.data.page_data;
      } else if (Array.isArray(json)) {
        pageData = json;
      }

      pageData.forEach(trip => {
        // According to user provided JSON, driver_name is in extra_details
        if (trip && trip.status === "completed" && trip.extra_details && trip.extra_details.driver_name) {
          completedRiders.add(trip.extra_details.driver_name.trim());
        }
      });

      console.log("[ChronoExt] Parsed completed riders API data:", Array.from(completedRiders));
      return completedRiders;
      
    } catch (err) {
      console.error("[ChronoExt] Error fetching completed riders via API:", err);
      throw err;
    }
  }

  // ── Salary Report Export (Trip Manager) ────────────────────

  function ensureSalaryExportButton() {
    if (!location.pathname.includes("/ops/retail/trip-manager")) return;
    if (document.querySelector('.chrono-ext-salary-btn')) return;

    // Find the right-side toolbar container (has Action, Download, pagination)
    const rightItems = document.querySelector('[class*="rightItems"]');
    if (!rightItems) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    // Use the exact same classes as the Action/Download buttons for consistent design
    btn.className = 'ant-btn middleButton-0-3-123 secondaryButton-0-3-118 chrono-ext-salary-btn';
    btn.innerHTML = `<span>📊 Export Salary</span>`;
    // Insert as first child so it appears to the LEFT of Action/Download
    rightItems.insertBefore(btn, rightItems.firstChild);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showMonthPickerModal();
    });
  }

  function showMonthPickerModal() {
    // Remove any existing modal
    const existing = document.querySelector('.chrono-ext-month-modal-overlay');
    if (existing) existing.remove();

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const monthNames = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    const monthOptions = monthNames.map((name, i) =>
      `<option value="${i}" ${i === currentMonth ? 'selected' : ''}>${name}</option>`
    ).join('');

    let yearOptions = '';
    for (let y = currentYear; y >= currentYear - 2; y--) {
      yearOptions += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'chrono-ext-month-modal-overlay';
    overlay.innerHTML = `
      <div class="chrono-ext-month-modal">
        <div class="chrono-ext-month-modal-header">
          <h3>📊 Export Salary Report</h3>
          <span class="chrono-ext-month-modal-close">×</span>
        </div>
        <div class="chrono-ext-month-modal-body">
          <div class="chrono-ext-export-type-toggle">
            <button type="button" class="chrono-ext-type-btn active" data-type="month">📅 Par Mois</button>
            <button type="button" class="chrono-ext-type-btn" data-type="day">📆 Par Jour</button>
          </div>

          <div id="chrono-month-container">
            <label>Sélectionner le mois :</label>
            <div class="chrono-ext-month-modal-selects">
              <select id="chrono-month-select">${monthOptions}</select>
              <select id="chrono-year-select">${yearOptions}</select>
            </div>
          </div>

          <div id="chrono-day-container" style="display:none;">
            <label>Sélectionner la date :</label>
            <div class="chrono-ext-day-input-wrapper">
              <input type="date" id="chrono-day-input" value="${todayStr}" max="${todayStr}">
            </div>
          </div>

          <div class="chrono-ext-month-modal-progress" style="display:none;">
            <div class="chrono-ext-progress-bar"><div class="chrono-ext-progress-fill"></div></div>
            <span class="chrono-ext-progress-text">Préparation...</span>
          </div>
        </div>
        <div class="chrono-ext-month-modal-footer">
          <button class="chrono-ext-modal-cancel-btn">Annuler</button>
          <button class="chrono-ext-modal-export-btn">Exporter</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Toggle between Month and Day export
    let currentExportType = 'month';
    const typeBtns = overlay.querySelectorAll('.chrono-ext-type-btn');
    const monthContainer = overlay.querySelector('#chrono-month-container');
    const dayContainer = overlay.querySelector('#chrono-day-container');

    typeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        typeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentExportType = btn.dataset.type;

        if (currentExportType === 'month') {
          monthContainer.style.display = 'block';
          dayContainer.style.display = 'none';
        } else {
          monthContainer.style.display = 'none';
          dayContainer.style.display = 'block';
        }
      });
    });

    // Close handlers
    const closeModal = () => overlay.remove();
    overlay.querySelector('.chrono-ext-month-modal-close').addEventListener('click', closeModal);
    overlay.querySelector('.chrono-ext-modal-cancel-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    // Export handler
    overlay.querySelector('.chrono-ext-modal-export-btn').addEventListener('click', async () => {
      let fromDate, toDate, exportOptions;

      if (currentExportType === 'month') {
        const month = parseInt(document.getElementById('chrono-month-select').value);
        const year = parseInt(document.getElementById('chrono-year-select').value);
        fromDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        toDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        exportOptions = { type: 'month', year, month };
      } else {
        const dayVal = document.getElementById('chrono-day-input').value;
        if (!dayVal) {
          alert('Veuillez sélectionner une date.');
          return;
        }
        fromDate = dayVal;
        toDate = dayVal;
        exportOptions = { type: 'day', date: dayVal };
      }

      const exportBtn = overlay.querySelector('.chrono-ext-modal-export-btn');
      const cancelBtn = overlay.querySelector('.chrono-ext-modal-cancel-btn');
      const closeBtn = overlay.querySelector('.chrono-ext-month-modal-close');
      const progress = overlay.querySelector('.chrono-ext-month-modal-progress');
      const progressText = overlay.querySelector('.chrono-ext-progress-text');
      const progressFill = overlay.querySelector('.chrono-ext-progress-fill');

      exportBtn.disabled = true;
      exportBtn.textContent = 'Exportation...';
      cancelBtn.disabled = true;
      closeBtn.style.pointerEvents = 'none';
      progress.style.display = 'block';

      try {
        progressText.textContent = exportOptions.type === 'month'
          ? 'Récupération des données du mois...'
          : 'Récupération des données du jour...';
        progressFill.style.width = '20%';

        const trips = await fetchTripData(fromDate, toDate);

        progressText.textContent = `${trips.length} trips trouvés. Récupération des détails...`;
        progressFill.style.width = '40%';

        const riderStats = await aggregateRiderStats(trips, (current, total) => {
          const pct = 40 + Math.floor((current / total) * 40);
          progressFill.style.width = `${pct}%`;
          progressText.textContent = `Analyse des détails... (${current}/${total})`;
        });

        progressText.textContent = 'Génération du fichier Excel...';
        progressFill.style.width = '80%';

        await exportSalaryReport(riderStats, exportOptions);

        progressText.textContent = '✅ Export terminé !';
        progressFill.style.width = '100%';

        setTimeout(() => overlay.remove(), 1500);
      } catch (err) {
        console.error('[ChronoExt] Salary export error:', err);
        progressText.textContent = `❌ Erreur: ${err.message}`;
        progressFill.style.width = '100%';
        progressFill.style.background = '#ff4d4f';
        exportBtn.disabled = false;
        exportBtn.textContent = 'Réessayer';
        cancelBtn.disabled = false;
        closeBtn.style.pointerEvents = 'auto';
      }
    });
  }

  async function fetchTripData(fromDate, toDate) {
    if (!apiTokens) {
      throw new Error('Tokens API non disponibles. Rafraîchissez la page et réessayez.');
    }

    console.log(`[ChronoExt] Fetching trips from ${fromDate} to ${toDate}`);

    const url = 'https://projectxeuapi.shipsy.io/api/retaildashboard/tripmanager/get';
    const allTrips = [];
    let lastTripId = null;
    let lastSortFieldValue = null;
    let hasMore = true;
    let pageNum = 0;

    while (hasMore) {
      pageNum++;
      const payload = {
        last_trip_id: lastTripId,
        last_sort_field_value: lastSortFieldValue,
        result_per_page: 200,
        next_or_prev: lastTripId ? 'next' : 'first',
        sort_by: 'last_main_event_time',
        descending_order: true,
        from_date: fromDate,
        to_date: toDate,
        date_field: 'last_main_event_time',
        organisation_reference_number: '',
        hub_id: '2477050730750414061',
        bucket: 'retail_completed',
        timezone: 'Africa/Casablanca'
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { ...apiTokens, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const json = await response.json();
      let pageData = [];

      if (json && json.data && Array.isArray(json.data.page_data)) {
        pageData = json.data.page_data;
      }

      console.log(`[ChronoExt] Page ${pageNum}: received ${pageData.length} trips (total so far: ${allTrips.length + pageData.length})`);

      if (pageData.length === 0) {
        hasMore = false;
        break;
      }

      allTrips.push(...pageData);

      // Log first trip keys for reference
      if (pageNum === 1 && pageData.length > 0) {
        const sample = pageData[0];
        console.log('[ChronoExt] Sample trip — top keys:', Object.keys(sample));
      }

      const lastTrip = pageData[pageData.length - 1];
      const nextTripId = lastTrip.id || lastTrip.trip_id;

      // Stop if pagination pointer did not advance to prevent infinite loop
      if (nextTripId === lastTripId) {
        hasMore = false;
        break;
      }

      lastTripId = nextTripId;
      lastSortFieldValue = lastTrip.last_main_event_time ?? lastTrip.end_time ?? lastTrip.updated_at;

      // Check if API specifies total_count
      const totalCount = json.data?.total_count || json.data?.total_records || json.data?.total;
      if (totalCount && allTrips.length >= totalCount) {
        hasMore = false;
        break;
      }

      if (json.data?.has_next === false || json.data?.is_last_page === true) {
        hasMore = false;
        break;
      }

      // Safety guard against runaway loops
      if (pageNum >= 60) {
        hasMore = false;
        break;
      }
    }

    console.log(`[ChronoExt] Fetched ${allTrips.length} completed trips across ${pageNum} page(s)`);
    return allTrips;
  }

  // Backward-compatibility wrapper
  async function fetchMonthlyTripData(year, month) {
    const fromDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const toDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return fetchTripData(fromDate, toDate);
  }

  let loggedFirstSummary = false;

  async function getTripTaskSummary(tripId, retries = 2) {
    if (!apiTokens) {
      console.warn('[ChronoExt] apiTokens missing in getTripTaskSummary');
      return null;
    }
    const url = `https://projectxeuapi.shipsy.io/api/RetailDashboard/trip/getTaskSummary?trip_id=${tripId}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            ...apiTokens,
            'Accept': 'application/json, text/plain, */*'
          }
        });
        if (res.status === 429) {
          // Rate limit backoff
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          console.warn(`[ChronoExt] getTaskSummary failed (${res.status}) for trip ${tripId}`);
          return null;
        }
        const json = await res.json();
        if (!loggedFirstSummary) {
          loggedFirstSummary = true;
          console.log('[ChronoExt] Sample getTaskSummary raw response:', json);
        }
        return json;
      } catch (e) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        console.error(`[ChronoExt] Error fetching task summary for ${tripId}:`, e);
        return null;
      }
    }
    return null;
  }

  function getCanonicalRiderName(rawName) {
    if (!rawName) return '';
    const trimmed = rawName.trim();
    const lower = trimmed.toLowerCase();

    // Map known aliases to unified canonical key
    if (lower === 'walid aichi' || lower === 'omar') return 'omar';
    if (
      lower === 'abd assamad krim' ||
      lower === 'sami' ||
      lower === 'hicham' ||
      lower.includes('assamad') ||
      lower.includes('krim') ||
      lower.includes('hicham')
    ) return 'hicham';
    if (lower === 'badr hachimi' || lower === 'bader hachimi') return 'bader hachimi';
    if (lower.includes('yourja') || lower.includes('mouhcine')) return 'mouhcine yourja';
    if (lower.includes('bahadi') || lower === 'abderrahmane bahadi' || lower === 'bahadi abderrahmane') return 'abderrahmane bahadi';

    return lower;
  }

  function extractMetric(data, keys) {
    if (!data || typeof data !== 'object') return null;

    // Direct property lookup
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') {
        const n = Number(data[k]);
        if (!isNaN(n)) return n;
      }
    }

    // Normalized (lowercase, no spaces/underscores/dashes) lookup
    const normalizedMap = new Map();
    for (const [prop, val] of Object.entries(data)) {
      if (val !== undefined && val !== null && val !== '') {
        const norm = prop.toLowerCase().replace(/[\s_\-]/g, '');
        const n = Number(val);
        if (!isNaN(n)) normalizedMap.set(norm, n);
      }
    }

    for (const k of keys) {
      const norm = k.toLowerCase().replace(/[\s_\-]/g, '');
      if (normalizedMap.has(norm)) {
        return normalizedMap.get(norm);
      }
    }

    return null;
  }

  function normalizeSummaryData(raw) {
    if (!raw) return {};
    let data = raw.data !== undefined ? raw.data : raw;
    if (Array.isArray(data)) {
      const obj = {};
      for (const item of data) {
        if (typeof item === 'string') {
          const m = item.match(/^(\d+)\s+(.+)$/);
          if (m) obj[m[2].trim()] = Number(m[1]);
        } else if (item && typeof item === 'object') {
          const key = item.status || item.label || item.type || item.name || item.key || item.task_status || item.task_type;
          const val = item.count ?? item.value ?? item.val ?? item.qty ?? item.quantity ?? item.total;
          if (key !== undefined && val !== undefined) {
            obj[String(key).trim()] = Number(val);
          }
        }
      }
      return obj;
    }
    return (typeof data === 'object' && data !== null) ? data : {};
  }

  function parseTaskSummary(raw) {
    const data = normalizeSummaryData(raw);

    // Candidates in priority order (do NOT include delivery_task_count which is planned total)
    const delivered = extractMetric(data, [
      'Delivered', 'delivered', 'delivered_task_count', 'delivered_count', 'success_task_count', 'deliveredCount'
    ]) ?? 0;

    const undelivered = extractMetric(data, [
      'Undelivered', 'undelivered', 'undelivered_task_count', 'attempted_task_count', 'failed_task_count', 'undelivered_count', 'attempted_count'
    ]) ?? 0;

    const pickupCompleted = extractMetric(data, [
      'Pickup Completed', 'pickup_completed', 'pickup_completed_task_count', 'pickedup_task_count', 'pickedup_count', 'pickupCompleted'
    ]) ?? 0;

    const pendingDelivery = extractMetric(data, [
      'Pending Delivery', 'pending_delivery', 'pending_delivery_task_count', 'incomplete_delivery_task_count', 'pending_task_count', 'pendingDelivery'
    ]) ?? 0;

    const pendingPickup = extractMetric(data, [
      'Pending Pickup', 'pending_pickup', 'pending_pickup_task_count', 'incomplete_pickup_task_count', 'pendingPickup'
    ]) ?? 0;

    const notPickedUp = extractMetric(data, [
      'Not Picked Up', 'not_picked_up', 'not_picked_up_task_count', 'notpickedup_task_count', 'notpickedup_count', 'notPickedUp'
    ]) ?? 0;

    const total = extractMetric(data, [
      'total_task_count', 'total_tasks', 'total_shipment_count', 'totalCount', 'total'
    ]);

    return {
      delivered,
      undelivered,
      pickupCompleted,
      pendingDelivery,
      pendingPickup,
      notPickedUp,
      total
    };
  }

  async function aggregateRiderStats(trips, progressCallback) {
    const stats = new Map();

    const batchSize = 10;
    for (let i = 0; i < trips.length; i += batchSize) {
      const batch = trips.slice(i, i + batchSize);
      
      if (progressCallback) progressCallback(i, trips.length);

      await Promise.all(batch.map(async (trip) => {
        const rawDriver = (trip.extra_details && trip.extra_details.driver_name)
                          ? trip.extra_details.driver_name.trim()
                          : (trip.worker_name ? trip.worker_name.trim() : null);
        if (!rawDriver) return;

        const canonicalDriver = getCanonicalRiderName(rawDriver);

        // Fetch task summary for this trip
        const tripId = trip.id || trip.trip_id;
        const summaryRaw = await getTripTaskSummary(tripId);
        const summary = parseTaskSummary(summaryRaw);

        const delivered = summary.delivered;
        const undelivered = summary.undelivered;
        const pickupCompleted = summary.pickupCompleted; // Only pickups that were actually completed/picked up
        const pendingDelivery = summary.pendingDelivery;

        // Only calculate actual handled parcels/pickups. If it was not picked up, do not calculate it.
        const handledTotal = delivered + undelivered + pickupCompleted + pendingDelivery;
        const totalFromApi = Number(trip.total_shipment_count || trip.total_task_count || 0);

        // When task summary is parsed, use handledTotal directly to exclude unpicked items (notPickedUp / pendingPickup).
        // Fallback to API total (minus unpicked items) if handledTotal is 0.
        const total = handledTotal > 0
          ? handledTotal
          : Math.max(0, totalFromApi - (summary.notPickedUp || 0) - (summary.pendingPickup || 0));

        if (canonicalDriver.includes('hachimi') || canonicalDriver.includes('bader') || canonicalDriver.includes('omar') || canonicalDriver.includes('yourja') || canonicalDriver.includes('mouhcine') || canonicalDriver.includes('bahadi') || canonicalDriver.includes('hicham')) {
          const tripRef = trip.organisation_reference_number || trip.trip_reference_number || tripId;
          console.log(`[ChronoExt] Trip ${tripRef} ("${rawDriver}" -> ${canonicalDriver}): Delivered=${delivered}, Undelivered=${undelivered}, TotalCalculated=${total}`);
        }

        if (!stats.has(canonicalDriver)) {
          stats.set(canonicalDriver, {
            displayName: rawDriver,
            totalParcels: 0,
            delivered: 0,
            undelivered: 0,
            recovered: 0,
            postponed: 0
          });
        }
        const s = stats.get(canonicalDriver);

        s.totalParcels += total;
        s.delivered += delivered + pickupCompleted;  // Completed pickups count as delivered
        s.undelivered += undelivered;
      }));
    }

    if (progressCallback) progressCallback(trips.length, trips.length);

    console.log('[ChronoExt] Aggregated rider stats:');
    for (const [name, data] of stats) {
      console.log(`  ${name} (${data.displayName}): Total=${data.totalParcels}, Delivered=${data.delivered}, Undelivered=${data.undelivered}`);
    }

    return stats;
  }

  async function exportSalaryReport(riderStats, exportOptions) {
    let opt = {};
    if (typeof exportOptions === 'object' && exportOptions !== null) {
      opt = exportOptions;
    } else {
      opt = { type: 'month', year: arguments[1], month: arguments[2] };
    }

    // Fetch the bundled Excel template
    const templateUrl = chrome.runtime.getURL('template/calcul-salaire-chrono-template.xlsx');
    const response = await fetch(templateUrl);
    if (!response.ok) throw new Error('Impossible de charger le template Excel');
    const arrayBuffer = await response.arrayBuffer();

    // Use xlsx-populate which preserves ALL formatting (colors, borders, fonts, merges)
    const wb = await XlsxPopulate.fromDataAsync(arrayBuffer);
    const sheet = wb.sheet(0);

    // Update header in B1 (xlsx-populate is 1-indexed)
    if (opt.type === 'day') {
      const parts = opt.date.split('-'); // [YYYY, MM, DD]
      sheet.cell('B1').value(`JOUR ${parts[2]}/${parts[1]}/${parts[0]}`);
    } else {
      sheet.cell('B1').value(`MOIS ${opt.month + 1}/${opt.year}`);
    }

    // Read rider names from A3 onwards and fill data
    let row = 3; // 1-indexed, so A3 = row 3
    let totalParcels = 0, totalDelivered = 0, totalUndelivered = 0;
    let totalRecovered = 0, totalPostponed = 0;

    while (true) {
      const cellVal = sheet.cell(row, 1).value(); // Column A
      if (cellVal === undefined || cellVal === null) break;

      const name = cellVal.toString().trim();
      if (name === '' || name.toUpperCase() === 'TOTAL') break;

      // Find matching rider using canonical name matching
      const nameCanonical = getCanonicalRiderName(name);
      let matched = null;

      if (riderStats.has(nameCanonical)) {
        matched = riderStats.get(nameCanonical);
      } else {
        // Fallback: check vowel-normalized or substring
        for (const [riderKey, riderData] of riderStats) {
          if (
            riderKey === nameCanonical ||
            riderKey.replace(/e/g, '') === nameCanonical.replace(/e/g, '') ||
            riderKey.includes(nameCanonical) ||
            nameCanonical.includes(riderKey)
          ) {
            matched = riderData;
            break;
          }
        }
      }

      // Special alias: HICHAM uses Abd Assamad Krim data
      if (!matched && (nameCanonical === 'hicham' || nameCanonical.includes('hicham'))) {
        matched = riderStats.get('hicham') ||
                  riderStats.get('abd assamad krim') ||
                  riderStats.get('sami');
        if (!matched) {
          for (const [riderKey, riderData] of riderStats) {
            if (riderKey.includes('assamad') || riderKey.includes('krim') || riderKey.includes('sami')) {
              matched = riderData;
              break;
            }
          }
        }
      }

      if (matched) {
        const sr = matched.totalParcels > 0
          ? Math.round((matched.delivered / matched.totalParcels) * 100)
          : 0;

        // .value() preserves all existing cell formatting (colors, borders, fonts)
        sheet.cell(row, 2).value(matched.totalParcels);    // B: T.Colis
        sheet.cell(row, 3).value(matched.delivered);        // C: Livrés
        sheet.cell(row, 4).value(matched.undelivered);      // D: Non Livrés
        sheet.cell(row, 5).value('-');                       // E: R.Récupéré
        sheet.cell(row, 6).value('-');                       // F: R.Ajourné
        sheet.cell(row, 7).value(`${sr}%`);                 // G: SR%

        totalParcels += matched.totalParcels;
        totalDelivered += matched.delivered;
        totalUndelivered += matched.undelivered;
      }
      // If not matched, leave cells untouched — original styling preserved

      row++;
    }

    // Find and fill TOTAL row
    for (let r = row; r <= row + 5; r++) {
      const cellVal = sheet.cell(r, 1).value();
      if (cellVal && cellVal.toString().trim().toUpperCase() === 'TOTAL') {
        const totalSr = totalParcels > 0
          ? Math.round((totalDelivered / totalParcels) * 100)
          : 0;

        sheet.cell(r, 2).value(totalParcels);
        sheet.cell(r, 3).value(totalDelivered);
        sheet.cell(r, 4).value(totalUndelivered);
        sheet.cell(r, 5).value(totalRecovered);
        sheet.cell(r, 6).value(totalPostponed);
        sheet.cell(r, 7).value(`${totalSr}%`);
        break;
      }
    }

    // Generate and download — xlsx-populate outputs a Blob with full formatting
    let filename = '';
    if (opt.type === 'day') {
      const parts = opt.date.split('-');
      filename = `calcul-salaire-${parts[2]}-${parts[1]}-${parts[0]}.xlsx`;
    } else {
      const monthNamesFile = [
        'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'
      ];
      filename = `calcul-salaire-${monthNamesFile[opt.month]}-${opt.year}.xlsx`;
    }

    const blob = await wb.outputAsync();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    console.log(`[ChronoExt] Salary report exported: ${filename}`);
  }


  
  function triggerReactClick(element) {
    if (!element) return;
    element.click();
    ['mousedown', 'mouseup', 'click'].forEach(evt => {
       element.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
    });
  }

  async function selectAntOption(selectEl, optionText, isSearchable = false) {
    const selectedItem = selectEl.querySelector('.ant-select-selection-item');
    if (selectedItem && selectedItem.textContent.trim() === optionText) return;

    const selector = selectEl.querySelector('.ant-select-selector') || selectEl;
    triggerReactClick(selector);
    
    await new Promise(r => setTimeout(r, 500));
    
    const searchInput = selectEl.querySelector('input');
    if (isSearchable && searchInput) {
      // Use native value setter for React
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(searchInput, optionText);
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 600)); // wait for network or filter
      }
    }
    
    const dropdowns = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'));
    const activeDropdown = dropdowns[dropdowns.length - 1];
    if (activeDropdown) {
      const options = Array.from(activeDropdown.querySelectorAll('.ant-select-item-option-content, .ant-select-item-option'));
      const target = options.find(opt => {
        const t = opt.textContent.replace(/\s+/g, '').toLowerCase();
        const o = optionText.replace(/\s+/g, '').toLowerCase();
        return t === o || t.includes(o) || o.includes(t);
      });
      if (target) triggerReactClick(target);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  async function selectDatePreset(pickerEl, presetText) {
    const input = pickerEl.querySelector('input') || pickerEl;
    triggerReactClick(input);
    
    await new Promise(r => setTimeout(r, 500));
    
    const dropdowns = Array.from(document.querySelectorAll('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)'));
    const activeDropdown = dropdowns[dropdowns.length - 1];
    if (activeDropdown) {
      const tags = Array.from(activeDropdown.querySelectorAll('.ant-tag'));
      const target = tags.find(tag => tag.textContent.trim() === presetText);
      if (target) triggerReactClick(target);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  let lastPathname = "";

  function ensureDefaultFilters() {
    if (window !== window.top) return; // Skip inside iframes
    if (!location.pathname.includes("/ops/consignments")) return;
    
    if (location.pathname !== lastPathname) {
      window.__chronoFiltersSet = false;
      lastPathname = location.pathname;
    }
    
    if (window.__chronoFiltersSet) return;
    
    const hubInput = document.querySelector('input#hubSearch');
    const datePicker = document.querySelector('.ant-picker-range');
    if (!hubInput || !datePicker) return;

    window.__chronoFiltersSet = true;
    
    (async () => {
      // Wait for page to finish its initial data loading and settle
      await new Promise(r => setTimeout(r, 1500));
      
      // 1. Hub
      const hubSelect = hubInput.closest('.ant-select');
      if (hubSelect) {
         // Pass "Mohammedia" so it filters successfully, but match against the full string
         await selectAntOption(hubSelect, "Mohammedia", true);
      }
      
      // 2. Date Type
      const allSelects = Array.from(document.querySelectorAll('.ant-select'));
      const dateTypeSelect = allSelects.find(s => {
          const t = s.textContent.trim();
          return t === "Created At" || t === "Last Event Time" || t === "Updated At";
      });
      if (dateTypeSelect) {
         await selectAntOption(dateTypeSelect, "Last Event Time");
      }
      
      // 3. Date Range Preset
      if (datePicker) {
         await selectDatePreset(datePicker, "Last 60 days");
      }
    })();
  }

  // ── Main loop via MutationObserver ────────────────────────

  let modalObserver = null;
  let rAFPending = false;

  function scheduleTick(doc = document) {
    if (rAFPending) return;
    rAFPending = true;
    requestAnimationFrame(() => {
      rAFPending = false;
      tick(doc);
    });
  }

  function tick(doc = document) {
    const modal = getScanModal(doc);
    if (!modal) return;
    widenModal(modal);
    ensureImportExcelButton(modal);
    processTableRows(modal);
  }

  // Watch for modal open/close on body
  const bodyObserver = new MutationObserver(() => {
    checkReconciliationToast();
    ensureInscanButton();
    ensureVerifyCompletedButton();
    ensureDefaultFilters();
    ensureSalaryExportButton();
    ensureStatusUpdateUI();
    ensureSettlementMenu();
    
    const modal = getScanModal(document);
    if (modal && !modalObserver) {
      scheduleTick(document);
      modalObserver = new MutationObserver(() => scheduleTick(document));
      modalObserver.observe(modal, { childList: true, subtree: true });
    } else if (!modal && modalObserver) {
      modalObserver.disconnect();
      modalObserver = null;
    }
  });

  bodyObserver.observe(document.body, { childList: true, subtree: true });

  // Fallback poll (SPA route changes may not trigger body mutations)
  setInterval(() => {
    checkReconciliationToast();
    ensureInscanButton();
    ensureVerifyCompletedButton();
    ensureDefaultFilters();
    ensureSalaryExportButton();
    ensureStatusUpdateUI();
    ensureSettlementMenu();

    
    const modal = getScanModal(document);
    if (modal) {
      scheduleTick(document);
      if (!modalObserver) {
        modalObserver = new MutationObserver(() => scheduleTick(document));
        modalObserver.observe(modal, { childList: true, subtree: true });
      }
    } else if (modalObserver) {
      modalObserver.disconnect();
      modalObserver = null;
    }
  }, 1000);

  // ── Rider Settlement Menu & Modal ────────────────────

  function ensureSettlementMenu() {
    const drawer = document.querySelector('.ant-drawer-open');
    const existingMenuItem = document.querySelector('.chrono-ext-settlement-menu-item');

    // If the drawer is closed, clean up any menu item
    if (!drawer) {
      if (existingMenuItem) existingMenuItem.remove();
      return;
    }

    // Search specifically for Financial Operations submenu items inside the open drawer
    const drawerItems = Array.from(drawer.querySelectorAll('.ant-menu-item'));
    let financeAnchorItem = null;

    for (const item of drawerItems) {
      if (item.classList.contains('chrono-ext-settlement-menu-item')) continue;

      const link = item.querySelector('a');
      const href = link ? (link.getAttribute('href') || '') : '';
      const menuId = item.getAttribute('data-menu-id') || '';
      const text = (item.textContent || '').trim();

      // Strictly identify Financial Operations sub-items
      const isFinanceSubItem = 
        href.includes('/ops/reconciliation/rider-list') ||
        href.includes('/ops/transactionsHistory') ||
        menuId.includes('riderReconciliation') ||
        menuId.includes('transactionsHistory') ||
        text === 'Rider Reconciliation' ||
        text === 'Transactions History' ||
        text === 'Historique des transactions';

      if (isFinanceSubItem) {
        financeAnchorItem = item;
        break;
      }
    }

    // If Financial Operations is NOT the active menu, remove our item immediately
    if (!financeAnchorItem) {
      if (existingMenuItem) existingMenuItem.remove();
      return;
    }

    const parentList = financeAnchorItem.closest('ul');
    if (!parentList) return;

    // If it's already in the correct parent list, do nothing
    if (existingMenuItem) {
      if (existingMenuItem.parentElement === parentList) {
        return;
      } else {
        existingMenuItem.remove();
      }
    }

    // Insert strictly into the Financial Operations submenu
    const newItem = document.createElement('li');
    newItem.className = 'ant-menu-item chrono-ext-settlement-menu-item';
    newItem.setAttribute('role', 'menuitem');
    newItem.setAttribute('tabindex', '-1');
    newItem.style.paddingLeft = financeAnchorItem.style.paddingLeft || '24px';
    
    newItem.innerHTML = `
      <span role="img" class="anticon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
      </span>
      <span class="ant-menu-title-content">
        <span>Rider Settlement Amounts</span>
      </span>
    `;

    financeAnchorItem.parentNode.insertBefore(newItem, financeAnchorItem.nextSibling);

    newItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const mask = document.querySelector('.ant-drawer-mask');
      if (mask) mask.click();

      showRiderSettlementModal();
    });
  }

  function showRiderSettlementModal() {
    const existing = document.querySelector('.chrono-ext-settlement-overlay');
    if (existing) existing.remove();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let currentRiders = [];

    const overlay = document.createElement('div');
    overlay.className = 'chrono-ext-month-modal-overlay chrono-ext-settlement-overlay';
    overlay.innerHTML = `
      <div class="chrono-ext-month-modal" style="width: 720px; max-width: 95vw;">
        <div class="chrono-ext-month-modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px;">💰</span>
            <h3 style="margin:0; font-size:16px;">Rider Settlement Amounts (Règlements)</h3>
          </div>
          <span class="chrono-ext-month-modal-close">×</span>
        </div>
        <div class="chrono-ext-month-modal-body">
          <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:12px; margin-bottom:16px;">
            <div style="flex:1;">
              <label style="display:block; margin-bottom:6px; font-weight:500; font-size:13px; color:#595959;">Date de règlement :</label>
              <input type="date" id="chrono-settlement-date" class="chrono-ext-settlement-date-input" value="${todayStr}" max="${todayStr}" style="width:100%;">
            </div>
            <div style="display:flex; gap:8px;">
              <button class="ant-btn chrono-status-btn" id="chrono-settlement-fetch-btn" style="min-width:110px; height:36px;">
                <span>Vérifier</span>
              </button>
              <button class="ant-btn" id="chrono-settlement-export-btn" disabled style="height:36px; display:inline-flex; align-items:center; gap:6px; border-radius:6px;">
                <span>📥 Exporter Excel</span>
              </button>
            </div>
          </div>

          <div id="chrono-settlement-filter-box" style="display:none; margin-bottom:12px;">
            <input type="text" id="chrono-settlement-search" placeholder="🔍 Filtrer par nom ou code livreur..." style="width:100%; height:32px; padding:0 10px; border:1px solid #d9d9d9; border-radius:6px; font-size:13px;">
          </div>
          
          <div class="chrono-ext-month-modal-progress" id="chrono-settlement-progress" style="display:none; margin-bottom:16px;">
            <div class="chrono-ext-progress-bar"><div class="chrono-ext-progress-fill" style="width:100%"></div></div>
            <span class="chrono-ext-progress-text">Récupération des données de règlement...</span>
          </div>

          <div id="chrono-settlement-results" style="max-height: 440px; overflow-y: auto; border: 1px solid #f0f0f0; border-radius: 6px; display: none;">
            <table class="chrono-ext-settlement-table">
              <thead style="position: sticky; top: 0; z-index: 2;">
                <tr>
                  <th style="text-align: left;">Livreur</th>
                  <th style="text-align: center; width: 90px;">Code</th>
                  <th style="text-align: center; width: 80px;">Colis</th>
                  <th style="text-align: right; width: 140px;">Montant Réglé</th>
                  <th style="text-align: center; width: 80px;">Détails</th>
                </tr>
              </thead>
              <tbody id="chrono-settlement-tbody">
              </tbody>
              <tfoot style="position: sticky; bottom: 0; z-index: 2;">
                <tr>
                  <td colspan="2" style="text-align: left;">Total Hub</td>
                  <td id="chrono-settlement-total-count" style="text-align: center;">0</td>
                  <td id="chrono-settlement-total-amount" style="text-align: right; color: #52c41a; font-size: 14px;">0.00 MAD</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('.chrono-ext-month-modal-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    const fetchBtn = overlay.querySelector('#chrono-settlement-fetch-btn');
    const exportBtn = overlay.querySelector('#chrono-settlement-export-btn');
    const dateInput = overlay.querySelector('#chrono-settlement-date');
    const searchInput = overlay.querySelector('#chrono-settlement-search');
    const filterBox = overlay.querySelector('#chrono-settlement-filter-box');
    const progress = overlay.querySelector('#chrono-settlement-progress');
    const results = overlay.querySelector('#chrono-settlement-results');
    const tbody = overlay.querySelector('#chrono-settlement-tbody');
    const totalCountEl = overlay.querySelector('#chrono-settlement-total-count');
    const totalAmountEl = overlay.querySelector('#chrono-settlement-total-amount');

    function renderTable(filterQuery = '') {
      tbody.innerHTML = '';
      const query = filterQuery.toLowerCase().trim();

      const filtered = currentRiders.filter(r => 
        !query || 
        r.name.toLowerCase().includes(query) || 
        (r.code && r.code.toLowerCase().includes(query))
      );

      let totalCount = 0;
      let totalAmt = 0;

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #888;">${currentRiders.length === 0 ? 'Aucun règlement trouvé pour cette date.' : 'Aucun résultat correspondant.'}</td></tr>`;
      } else {
        filtered.forEach((item, idx) => {
          totalCount += (item.deliveredCount || item.count || 0);
          totalAmt += item.amount;

          const reconciledByList = Array.from(new Set((item.parcels || []).map(p => p.employee_name).filter(Boolean))).join(', ') || item.cashier || 'N.A.';

          const tr = document.createElement('tr');
          tr.style.cursor = 'pointer';
          tr.innerHTML = `
            <td>
              <strong>${item.name}</strong>
              <div style="font-size:11px; color:#888; margin-top:2px;">Reconciled: <span style="color:#262626; font-weight:500;">${reconciledByList}</span></div>
            </td>
            <td style="text-align: center;"><span style="background:#f5f5f5; padding:2px 6px; border-radius:4px; font-size:12px; font-family:monospace;">${item.code || '-'}</span></td>
            <td style="text-align: center;">
              <span style="background:#e6f7ff; color:#1890ff; padding:2px 8px; border-radius:10px; font-weight:600; font-size:12px;" title="${item.deliveredCount || item.count} Livrés / ${item.undeliveredCount || 0} Non livrés">
                ${item.deliveredCount || item.count} livrés
              </span>
              ${item.undeliveredCount > 0 ? `<div style="font-size:11px; color:#ff4d4f; margin-top:2px; font-weight:500;">${item.undeliveredCount} non-livrés</div>` : ''}
            </td>
            <td style="text-align: right; font-weight: 600; color: #262626;">
              ${item.amount.toFixed(2)} MAD
              ${item.status === 'in_transit' ? '<div style="font-size:10px; color:#fa8c16; font-weight:normal;">En course</div>' : ''}
            </td>
            <td style="text-align: center;"><button class="ant-btn ant-btn-sm chrono-details-toggle" style="font-size:11px; height:24px; padding:0 8px;">Détails</button></td>
          `;

          // Sub-row for detailed parcel breakdown
          const subTr = document.createElement('tr');
          subTr.style.display = 'none';
          subTr.style.backgroundColor = '#fafafa';

          subTr.innerHTML = `
            <td colspan="5" style="padding: 12px 16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
                <div style="font-weight:600; font-size:13px; color:#262626;">
                  Colis pour ${item.name} (<span class="chrono-sub-count">${item.deliveredCount || item.count} livrés</span>${item.undeliveredCount > 0 ? `, <span style="color:#ff4d4f;">${item.undeliveredCount} non-livrés</span>` : ''}) :
                </div>
                <div class="chrono-sub-filter-buttons" style="display:flex; gap:6px;">
                  <button class="ant-btn ant-btn-sm chrono-btn-filter-all" style="font-size:11px; height:24px; padding:0 8px; background:#1890ff; color:#fff; border-color:#1890ff;">Tous</button>
                  <button class="ant-btn ant-btn-sm chrono-btn-filter-del" style="font-size:11px; height:24px; padding:0 8px;">Livrés</button>
                  <button class="ant-btn ant-btn-sm chrono-btn-filter-undel" style="font-size:11px; height:24px; padding:0 8px;">Non-livrés</button>
                </div>
              </div>
              <div class="chrono-sub-parcels-container" style="max-height:220px; overflow-y:auto; background:#fff; border:1px solid #e8e8e8; border-radius:6px; padding:4px;">
                <div style="text-align:center; padding:16px; color:#888;">Chargement des colis...</div>
              </div>
            </td>
          `;

          const container = subTr.querySelector('.chrono-sub-parcels-container');
          let currentParcelsView = [];

          function renderSubParcels(filterType = 'all') {
            let list = currentParcelsView;
            if (filterType === 'del') list = list.filter(p => p.isDelivered);
            if (filterType === 'undel') list = list.filter(p => !p.isDelivered);

            if (list.length === 0) {
              container.innerHTML = `<div style="text-align:center; padding:16px; color:#888;">Aucun colis dans cette vue.</div>`;
              return;
            }

            container.innerHTML = list.map(p => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; border-bottom:1px solid #f0f0f0; font-size:12px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-family:monospace; color:#1890ff; font-weight:600; font-size:13px;">${p.reference_number}</span>
                  <button class="chrono-copy-cn-btn" data-cn="${p.reference_number}" title="Copier le code" style="cursor:pointer; border:1px solid #d9d9d9; background:#fff; border-radius:4px; padding:1px 5px; font-size:11px;">📋 Copier</button>
                  ${p.isDelivered 
                    ? '<span style="background:#f6ffed; color:#52c41a; border:1px solid #b7eb8f; padding:1px 6px; border-radius:4px; font-size:11px;">✔ Livré</span>' 
                    : `<span style="background:#fff1f0; color:#ff4d4f; border:1px solid #ffa39e; padding:1px 6px; border-radius:4px; font-size:11px;">✖ ${p.failure_reason || 'Non livré'}</span>`}
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                  ${p.customer_name ? `<span style="color:#595959; font-size:11px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.customer_name}</span>` : ''}
                  <span style="font-weight:600; color:${p.amount > 0 ? '#52c41a' : '#8c8c8c'}; min-width:80px; text-align:right;">
                    ${p.amount > 0 ? `${p.amount.toFixed(2)} MAD` : '0.00 MAD'}
                  </span>
                </div>
              </div>
            `).join('');

            // Attach copy event listeners
            container.querySelectorAll('.chrono-copy-cn-btn').forEach(btn => {
              btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const cn = btn.getAttribute('data-cn');
                if (cn) {
                  navigator.clipboard.writeText(cn).then(() => {
                    const orig = btn.textContent;
                    btn.textContent = '✔ Copié !';
                    btn.style.color = '#52c41a';
                    setTimeout(() => {
                      btn.textContent = orig;
                      btn.style.color = '';
                    }, 1500);
                  });
                }
              });
            });
          }

          // Sub-filter tabs
          const btnAll = subTr.querySelector('.chrono-btn-filter-all');
          const btnDel = subTr.querySelector('.chrono-btn-filter-del');
          const btnUndel = subTr.querySelector('.chrono-btn-filter-undel');

          const setSubFilterActive = (activeBtn) => {
            [btnAll, btnDel, btnUndel].forEach(b => {
              b.style.background = '#fff';
              b.style.color = '#595959';
              b.style.borderColor = '#d9d9d9';
            });
            activeBtn.style.background = '#1890ff';
            activeBtn.style.color = '#fff';
            activeBtn.style.borderColor = '#1890ff';
          };

          btnAll.addEventListener('click', (e) => {
            e.stopPropagation();
            setSubFilterActive(btnAll);
            renderSubParcels('all');
          });
          btnDel.addEventListener('click', (e) => {
            e.stopPropagation();
            setSubFilterActive(btnDel);
            renderSubParcels('del');
          });
          btnUndel.addEventListener('click', (e) => {
            e.stopPropagation();
            setSubFilterActive(btnUndel);
            renderSubParcels('undel');
          });

          const loadTripParcels = async () => {
            if (item.detailsLoaded) return;
            try {
              let parcels = [];
              const refs = (item.tripRefs && item.tripRefs.length > 0) ? item.tripRefs : (item.code ? [item.code] : []);
              for (const ref of refs) {
                if (ref && ref !== 'RECON' && ref !== '-') {
                  const fetched = await fetchTripConsignmentsApi(ref);
                  parcels.push(...fetched);
                }
              }

              // Also merge any parcels recorded in reconciliation ledger that were missing
              if (item.parcels && item.parcels.length > 0) {
                item.parcels.forEach(p => {
                  const exists = parcels.some(existing => existing.reference_number === (p.reference_number || p.id));
                  if (!exists) {
                    parcels.push({
                      reference_number: p.reference_number || p.id,
                      isDelivered: true,
                      amount: p.amount || 0,
                      customer_name: p.employee_name ? `Reconciled: ${p.employee_name}` : '',
                      failure_reason: ''
                    });
                  }
                });
              }

              item.detailedParcels = parcels;
              item.detailsLoaded = true;
              currentParcelsView = parcels;
              renderSubParcels('all');
            } catch (err) {
              container.innerHTML = `<div style="text-align:center; padding:16px; color:#ff4d4f;">Erreur lors du chargement des colis (${err.message})</div>`;
            }
          };

          const toggleDetails = () => {
            const isVisible = subTr.style.display !== 'none';
            subTr.style.display = isVisible ? 'none' : 'table-row';
            const btn = tr.querySelector('.chrono-details-toggle');
            if (btn) btn.textContent = isVisible ? 'Détails' : 'Masquer';
            if (!isVisible && !item.detailsLoaded) {
              loadTripParcels();
            }
          };

          tr.addEventListener('click', (e) => {
            toggleDetails();
          });

          tbody.appendChild(tr);
          tbody.appendChild(subTr);
        });
      }

      totalCountEl.textContent = totalCount;
      totalAmountEl.textContent = `${totalAmt.toFixed(2)} MAD`;
    }

    searchInput.addEventListener('input', (e) => {
      renderTable(e.target.value);
    });

    fetchBtn.addEventListener('click', async () => {
      const selectedDate = dateInput.value;
      if (!selectedDate) return;

      fetchBtn.disabled = true;
      exportBtn.disabled = true;
      progress.style.display = 'block';
      results.style.display = 'none';
      filterBox.style.display = 'none';

      try {
        currentRiders = await fetchRiderSettlementsApi(selectedDate);
        currentRiders.sort((a, b) => b.amount - a.amount);
        
        renderTable();

        results.style.display = 'block';
        if (currentRiders.length > 0) {
          filterBox.style.display = 'block';
          exportBtn.disabled = false;
        }
      } catch (err) {
        console.error("[ChronoExt] Settlement Fetch Error:", err);
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #ef4444;">
          Erreur lors du chargement (${err.message}).<br>
          <small style="color:#888;">Vérifiez votre connexion et rechargez la page si nécessaire.</small>
        </td></tr>`;
        results.style.display = 'block';
      } finally {
        fetchBtn.disabled = false;
        progress.style.display = 'none';
      }
    });

    exportBtn.addEventListener('click', async () => {
      if (!currentRiders || currentRiders.length === 0) return;
      if (typeof XLSX === 'undefined') {
        alert("Bibliothèque XLSX non disponible.");
        return;
      }
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary per rider
      const wsSummaryData = [
        ["Livreur", "N° Course", "Colis Livrés", "Colis Non-Livrés", "Total Colis", "Montant Règlement (MAD)", "Reconciled By", "Statut Course"],
        ...currentRiders.map(d => [
          d.name,
          d.code,
          d.deliveredCount || d.count,
          d.undeliveredCount || 0,
          d.totalCount || d.count,
          d.amount,
          d.cashier || Array.from(new Set((d.parcels || []).map(p => p.employee_name).filter(Boolean))).join(', ') || 'N.A.',
          d.status === 'in_transit' ? 'En course' : 'Terminée'
        ]),
        ["TOTAL HUB", "", parseInt(totalCountEl.textContent, 10), "", "", parseFloat(totalAmountEl.textContent), "", ""]
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(wsSummaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Synthèse Règlements");

      // Sheet 2: Detailed parcels list (from loaded parcels or reconnaissance)
      const wsParcelsData = [
        ["N° Expédition (CN)", "Livreur", "N° Course", "Statut", "Montant CRBT (MAD)", "Client", "Motif Échec"]
      ];
      currentRiders.forEach(r => {
        const pList = r.detailedParcels || r.parcels || [];
        pList.forEach(p => {
          wsParcelsData.push([
            p.reference_number || p.id,
            r.name,
            r.code,
            p.isDelivered ? 'Livré' : 'Non-livré',
            p.amount || 0,
            p.customer_name || '',
            p.failure_reason || ''
          ]);
        });
      });
      const wsParcels = XLSX.utils.aoa_to_sheet(wsParcelsData);
      XLSX.utils.book_append_sheet(wb, wsParcels, "Détail Colis");

      XLSX.writeFile(wb, `Reglements_Livreurs_${dateInput.value}.xlsx`);
    });
  }

  async function fetchTripConsignmentsApi(tripRef) {
    if (!apiTokens || !tripRef || tripRef === '-') return [];
    let url = `https://projectxeuapi.shipsy.io/api/retaildashboard/tripdetails/get?searchBy=organisation_reference_number&searchKey=${tripRef}&timezone=Africa/Casablanca`;
    try {
      let res = await fetch(url, {
        method: "GET",
        headers: {
          ...apiTokens,
          "Accept": "application/json"
        }
      });
      if (!res.ok) {
        url = `https://projectxeuapi.shipsy.io/api/retaildashboard/tripdetails/get?searchBy=trip_reference_number&searchKey=${tripRef}&timezone=Africa/Casablanca`;
        res = await fetch(url, {
          method: "GET",
          headers: { ...apiTokens, "Accept": "application/json" }
        });
      }
      if (!res.ok) return [];
      const json = await res.json();
      const cnDetails = json.data?.consignmentDetails;
      const completeCns = cnDetails?.complete || [];
      const incompleteCns = cnDetails?.incomplete || [];
      let all = [...completeCns, ...incompleteCns];

      if (all.length === 0 && json.data?.taskDetails) {
        const td = json.data.taskDetails;
        all = [...(td.complete || []), ...(td.incomplete || [])];
      }

      return all.map(c => {
        const inTripStatus = c.consignment_in_trip_status || '';
        const taskStatus = c.task_status || '';
        const st = c.consignment_status || c.status || '';
        const isDelivered = (inTripStatus && inTripStatus.toLowerCase() === 'delivered')
            || (taskStatus && taskStatus.toLowerCase() === 'success')
            || st.toLowerCase() === 'delivered'
            || st.toLowerCase() === 'rto_delivered'
            || st.toLowerCase() === 'success';

        const cod = Number(c.cod_amount || c.amount || c.cod_value || 0);
        const failureReason = c.delivery_failure_reason || c.failure_reason || '';
        return {
          reference_number: c.reference_number || c.consignment_reference_number || c.hu_number || c.id,
          isDelivered,
          amount: cod,
          customer_name: c.customer_name || '',
          address: c.receiver_address || '',
          failure_reason: failureReason
        };
      });
    } catch (e) {
      console.warn(`[ChronoExt] Error loading consignments for ${tripRef}:`, e);
      return [];
    }
  }

  async function fetchRiderSettlementsApi(dateStr) {
    if (!apiTokens) throw new Error("Tokens d'API non capturés. Veuillez recharger la page.");

    const tripUrl = "https://projectxeuapi.shipsy.io/api/retaildashboard/tripmanager/get";
    const reconUrl = "https://projectxeuapi.shipsy.io/api/Dashboard/riderReconciliation/getReconciliationData";
    
    // Parse date into DD/MM/YYYY
    const [year, month, day] = dateStr.split('-');
    const dmyStr = `${day}/${month}/${year}`;

    // 1. Fetch trips from Trip Manager for the selected date
    let allTrips = [];
    try {
      const [compRes, transitRes] = await Promise.all([
        fetch(tripUrl, {
          method: "POST",
          headers: { ...apiTokens, "Content-Type": "application/json" },
          body: JSON.stringify({
            from_date: dateStr,
            to_date: dateStr,
            hub_id: "2477050730750414061",
            bucket: "retail_completed"
          })
        }),
        fetch(tripUrl, {
          method: "POST",
          headers: { ...apiTokens, "Content-Type": "application/json" },
          body: JSON.stringify({
            from_date: dateStr,
            to_date: dateStr,
            hub_id: "2477050730750414061",
            bucket: "retail_in_transit"
          })
        })
      ]);

      if (compRes.ok) {
        const compJson = await compRes.json();
        const pData = compJson.data?.page_data || compJson.data?.pageData || [];
        allTrips.push(...pData);
      }
      if (transitRes.ok) {
        const transitJson = await transitRes.json();
        const pData = transitJson.data?.page_data || transitJson.data?.pageData || [];
        allTrips.push(...pData);
      }
    } catch (err) {
      console.warn("[ChronoExt] Failed to fetch trips from tripmanager:", err);
    }

    // 2. Fetch settlement transactions from Reconciliation ledger
    let allSettlements = [];
    const seenIds = new Set();

    try {
      for (let pNo = 1; pNo <= 5; pNo++) {
        const reconPayload = {
          startDate: null,
          endDate: null,
          hubList: ["2477050730750414061"],
          pageNo: pNo,
          resultsPerPage: 100,
          cashSource: "ALL"
        };
        const reconRes = await fetch(reconUrl, {
          method: "POST",
          headers: { ...apiTokens, "Content-Type": "application/json" },
          body: JSON.stringify(reconPayload)
        });

        if (!reconRes.ok) break;
        const reconJson = await reconRes.json();
        const rList = reconJson.data?.reconciliationData || reconJson.data?.page_data || [];
        if (rList.length === 0) break;

        let hasOlderDate = false;
        rList.forEach(item => {
          const creditType = (item.credit_type || '').toLowerCase();
          if (creditType !== 'settlement') return;

          const created = item.created_at || '';
          if (created.includes(dmyStr) || created.includes(dateStr) || !created) {
            const id = item.id || `${item.reference_number}_${created}_${item.amount}`;
            if (!seenIds.has(id)) {
              seenIds.add(id);
              allSettlements.push(item);
            }
          } else {
            hasOlderDate = true;
          }
        });

        if (hasOlderDate && pNo > 1) break;
      }
    } catch (err) {
      console.warn("[ChronoExt] Failed to fetch reconciliation data:", err);
    }

    // 3. Build unified rider list
    const riderMap = {};

    function getCanonicalName(raw) {
      return (raw || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // A. Populate from Trip Manager (Official source of task counts)
    allTrips.forEach(t => {
      const driverName = (t.extra_details?.driver_name || t.worker_name || 'Livreur').trim();
      const tripRef = t.organisation_reference_number || t.trip_reference_number || 'MOH';
      const key = getCanonicalName(driverName) || tripRef.toLowerCase();

      if (!riderMap[key]) {
        riderMap[key] = {
          name: driverName,
          code: tripRef,
          tripRefs: [tripRef],
          deliveredCount: 0,
          undeliveredCount: 0,
          totalCount: 0,
          status: t.status || 'completed',
          tripCredits: 0,
          settledAmount: 0,
          amount: 0,
          cashier: null,
          parcels: [],
          detailsLoaded: false
        };
      } else {
        if (tripRef && !riderMap[key].tripRefs.includes(tripRef)) {
          riderMap[key].tripRefs.push(tripRef);
        }
      }

      riderMap[key].deliveredCount += (t.delivered_task_count || 0);
      riderMap[key].undeliveredCount += (t.attempted_task_count || 0);
      riderMap[key].totalCount += (t.total_task_count || ((t.delivered_task_count || 0) + (t.attempted_task_count || 0)));
      if (t.credits && t.credits > 0) {
        riderMap[key].tripCredits = Math.max(riderMap[key].tripCredits || 0, t.credits);
      }
    });

    // B. Correlate with settlements from reconciliation ledger
    allSettlements.forEach(item => {
      const riderName = (item.worker_name || 'Inconnu').trim();
      const code = (item.worker_code || '').trim();
      const positiveAmt = Math.abs(parseFloat(item.amount) || 0);
      const key = getCanonicalName(riderName) || (code ? code.toLowerCase() : 'unknown');

      if (!riderMap[key]) {
        riderMap[key] = {
          name: riderName,
          code: code || 'RECON',
          tripRefs: [],
          deliveredCount: 0,
          undeliveredCount: 0,
          totalCount: 0,
          status: 'completed',
          tripCredits: 0,
          settledAmount: 0,
          amount: 0,
          cashier: item.employee_name,
          parcels: [],
          detailsLoaded: false
        };
      }

      riderMap[key].settledAmount = (riderMap[key].settledAmount || 0) + positiveAmt;
      if (item.employee_name && !riderMap[key].cashier) {
        riderMap[key].cashier = item.employee_name;
      }
      riderMap[key].parcels.push({
        id: item.id,
        reference_number: item.reference_number,
        amount: positiveAmt,
        created_at: item.created_at,
        employee_name: item.employee_name,
        isDelivered: true
      });
    });

    // C. Finalize amount and count fallbacks
    Object.values(riderMap).forEach(r => {
      const settled = r.settledAmount || 0;
      const credits = r.tripCredits || 0;
      r.amount = settled > 0 ? settled : credits;

      if (r.deliveredCount === 0 && r.parcels.length > 0) {
        r.deliveredCount = r.parcels.length;
        r.totalCount = r.parcels.length;
      }
    });

    return Object.values(riderMap);
  }

  // ── Consignment Status Update ────────────────────────

  function ensureStatusUpdateUI() {
    if (!location.pathname.includes('/ops/details/')) {
      const widget = document.querySelector('.chrono-status-widget');
      if (widget) widget.remove();
      return;
    }

    if (document.querySelector('.chrono-status-widget')) return;

    // Extract reference number safely from URL
    const cleanPath = location.pathname.replace(/\/+$/, '');
    const parts = cleanPath.split('/').filter(Boolean);
    const referenceNumber = parts[parts.length - 1];
    if (!referenceNumber) return;

    const savedApiKey = localStorage.getItem('chrono_shipsy_api_key') || '';

    const widget = document.createElement('div');
    widget.className = 'chrono-status-widget';
    widget.innerHTML = `
      <div class="chrono-status-header">
        <span>Chrono: Update Status</span>
        <button class="chrono-status-key-toggle" title="Configure Shipsy API Key" type="button">🔑</button>
      </div>
      <div class="chrono-status-body">
        <div class="chrono-status-key-box" style="${savedApiKey ? 'display: none;' : ''}">
          <input type="password" class="chrono-status-key-input" placeholder="Paste Shipsy API Key" value="${savedApiKey ? '••••••••' : ''}" />
          <button class="chrono-status-key-save" type="button">Save</button>
        </div>
        <select class="chrono-status-select">
          <option value="">-- Select Status --</option>
          <option value="reached_at_hub">Reached at Hub</option>
          <option value="delivered">Delivered</option>
          <option value="attempted">Attempted / Undelivered</option>
          <option value="cancel">Cancelled</option>
          <option value="pickup_completed">Pickup Completed</option>
          <option value="reacheddestination">Reached Destination</option>
          <option value="rto_delivered">RTO Delivered</option>
          <option value="rto">RTO Initiated</option>
        </select>
        <input type="text" class="chrono-status-reason" placeholder="Reason (e.g. absent, refusé, injoignable)" style="display: none;" />
        <button class="chrono-status-btn" disabled>Update</button>
      </div>
    `;

    document.body.appendChild(widget);

    const select = widget.querySelector('.chrono-status-select');
    const reasonInput = widget.querySelector('.chrono-status-reason');
    const btn = widget.querySelector('.chrono-status-btn');
    const keyToggle = widget.querySelector('.chrono-status-key-toggle');
    const keyBox = widget.querySelector('.chrono-status-key-box');
    const keyInput = widget.querySelector('.chrono-status-key-input');
    const keySaveBtn = widget.querySelector('.chrono-status-key-save');

    // Toggle API key box
    keyToggle.addEventListener('click', () => {
      const isHidden = keyBox.style.display === 'none';
      keyBox.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        keyInput.value = localStorage.getItem('chrono_shipsy_api_key') || '';
        keyInput.focus();
      }
    });

    // Save API key
    keySaveBtn.addEventListener('click', () => {
      const val = keyInput.value.trim();
      if (val && !val.includes('••••')) {
        localStorage.setItem('chrono_shipsy_api_key', val);
        showToast('Shipsy API Key saved ✓');
        keyBox.style.display = 'none';
      } else if (!val) {
        localStorage.removeItem('chrono_shipsy_api_key');
        showToast('Shipsy API Key removed');
      } else {
        keyBox.style.display = 'none';
      }
    });

    const checkValidity = () => {
      const needsReason = select.value === 'attempted' || select.value === 'cancel';
      if (needsReason) {
        btn.disabled = !reasonInput.value.trim();
      } else {
        btn.disabled = !select.value;
      }
    };

    select.addEventListener('change', () => {
      if (select.value === 'attempted' || select.value === 'cancel') {
        reasonInput.style.display = 'block';
      } else {
        reasonInput.style.display = 'none';
        reasonInput.value = '';
      }
      checkValidity();
    });

    reasonInput.addEventListener('input', checkValidity);

    btn.addEventListener('click', async () => {
      const eventCode = select.value;
      if (!eventCode) return;
      const reason = reasonInput.value.trim();
      const currentApiKey = localStorage.getItem('chrono_shipsy_api_key') || '';

      if (!currentApiKey) {
        keyBox.style.display = 'flex';
        keyInput.value = '';
        keyInput.focus();
        showToast('⚠️ Shipsy API Key required. Please enter your API key and click Save.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Updating...';

      try {
        await updateConsignmentStatus(eventCode, referenceNumber, reason, currentApiKey);
        showToast(`✓ Status successfully updated to ${eventCode}`);
        setTimeout(() => location.reload(), 1800);
      } catch (err) {
        console.error('[ChronoExt] Status update failed:', err);
        const errStr = err.message || String(err);
        
        if (errStr.includes('API key') || errStr.includes('NO_API_KEY') || errStr.includes('WRONG_API_KEY') || errStr.includes('401')) {
          keyBox.style.display = 'flex';
          keyInput.focus();
          showToast(`❌ Authentication failed: ${errStr}. Check API Key.`);
        } else {
          showToast(`❌ Update failed: ${errStr}`);
        }

        btn.disabled = false;
        btn.textContent = 'Update';
      }
    });
  }

  function updateConsignmentStatus(eventCode, referenceNumber, reason, apiKey) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'UPDATE_CONSIGNMENT_STATUS',
        eventCode,
        referenceNumber,
        reason,
        apiKey: apiKey || localStorage.getItem('chrono_shipsy_api_key') || '',
        apiTokens
      }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message || 'Failed to communicate with extension background service worker. Please reload the extension.'));
        }
        if (!response) {
          return reject(new Error('No response from background service worker.'));
        }
        if (!response.success) {
          return reject(new Error(response.error || `HTTP ${response.status || 'Error'}`));
        }
        resolve(response.data);
      });
    });
  }

  console.log("[ChronoExt] Parcel Status extension loaded ✓");
})();

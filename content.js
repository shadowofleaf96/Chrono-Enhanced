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
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'CHRONO_TOKENS') {
      apiTokens = event.data.tokens;
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

  function hideInscanOverlay() {
    const overlay = document.querySelector('.chrono-iframe-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
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

  function ensureInscanButton() {
    if (!location.pathname.includes("/ops/reconciliation/recon/")) return;
    
    const buttons = Array.from(document.querySelectorAll('button'));
    const reconcileBtn = buttons.find(b => b.textContent.trim() === 'Reconcile');
    const cancelBtn = buttons.find(b => b.textContent.trim() === 'Cancel');
    const reloadBtn = buttons.find(b => b.querySelector('.anticon-reload'));
    
    if (reloadBtn && !reloadBtn.dataset.chronoToastAttached) {
      reloadBtn.dataset.chronoToastAttached = 'true';
      reloadBtn.addEventListener('click', () => {
        toastShownForUrl = null;
      });
    }
    
    if (reconcileBtn && !document.querySelector('.chrono-inscan-ext-btn')) {
      const container = reconcileBtn.parentElement;
      const inscanBtn = document.createElement('button');
      
      if (cancelBtn) {
        inscanBtn.className = cancelBtn.className;
        inscanBtn.classList.add('chrono-inscan-ext-btn');
      } else {
        inscanBtn.className = "ant-btn chrono-inscan-ext-btn";
        inscanBtn.style.color = "#1890ff";
        inscanBtn.style.borderColor = "#1890ff";
        inscanBtn.style.background = "#f0f7ff";
      }
      
      inscanBtn.style.marginRight = "8px";
      inscanBtn.innerHTML = `<span>Inscan at Hub</span>`;
      
      container.insertBefore(inscanBtn, reconcileBtn.previousElementSibling || reconcileBtn);
      
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

  // ── Auto-set Filters on Consignments Page ─────────────────
  
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

  // Start preloading the Inscan iframe immediately on any page
  // so it's ready by the time the user reaches the recon page
  preloadInscanModal();

  console.log("[ChronoExt] Parcel Status extension loaded ✓");
})();

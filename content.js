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
    if (lower === 'abd assamad krim' || lower === 'sami') return 'sami';
    if (lower === 'badr hachimi' || lower === 'bader hachimi') return 'bader hachimi';

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

        if (canonicalDriver.includes('hachimi') || canonicalDriver.includes('bader') || canonicalDriver.includes('omar')) {
          console.log(`[ChronoExt] Trip ${tripId} (${rawDriver} -> ${canonicalDriver}): Delivered=${summary.delivered}, Undelivered=${summary.undelivered}, Total=${trip.total_task_count}`);
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

        const delivered = summary.delivered;
        const undelivered = summary.undelivered;
        const pickupCompleted = summary.pickupCompleted;
        const pendingDelivery = summary.pendingDelivery;
        const pendingPickup = summary.pendingPickup;
        const notPickedUp = summary.notPickedUp;

        const summarySum = delivered + undelivered + pickupCompleted + pendingDelivery + pendingPickup + notPickedUp;
        const totalFromApi = Number(trip.total_task_count || trip.total_shipment_count || 0);
        const total = totalFromApi > 0 ? totalFromApi : ((summary.total !== null && summary.total > 0) ? summary.total : summarySum);

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

  // ── Consignment Status Update ────────────────────────

  function ensureStatusUpdateUI() {
    if (!location.pathname.includes('/ops/details/')) {
      const widget = document.querySelector('.chrono-status-widget');
      if (widget) widget.remove();
      return;
    }

    if (document.querySelector('.chrono-status-widget')) return;

    // Extract reference number from URL
    const parts = location.pathname.split('/');
    const referenceNumber = parts[parts.length - 1];
    if (!referenceNumber) return;

    const widget = document.createElement('div');
    widget.className = 'chrono-status-widget';
    widget.innerHTML = `
      <div class="chrono-status-header">Chrono: Update Status</div>
      <div class="chrono-status-body">
        <select class="chrono-status-select">
          <option value="">-- Select Status --</option>
          <option value="reached_at_hub">Reached at Hub</option>
          <option value="delivered">Delivered</option>
          <option value="attempted">Attempted / Undelivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="pickup_completed">Pickup Completed</option>
          <option value="reacheddestination">Reached Destination</option>
          <option value="rto_delivered">RTO Delivered</option>
        </select>
        <input type="text" class="chrono-status-reason" placeholder="Reason (e.g. refused, absent)" style="display: none;" />
        <button class="chrono-status-btn" disabled>Update</button>
      </div>
    `;

    document.body.appendChild(widget);

    const select = widget.querySelector('.chrono-status-select');
    const reasonInput = widget.querySelector('.chrono-status-reason');
    const btn = widget.querySelector('.chrono-status-btn');

    const checkValidity = () => {
      const isAttempted = select.value === 'attempted';
      if (isAttempted) {
        btn.disabled = !reasonInput.value.trim();
      } else {
        btn.disabled = !select.value;
      }
    };

    select.addEventListener('change', () => {
      if (select.value === 'attempted') {
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

      btn.disabled = true;
      btn.textContent = 'Updating...';

      try {
        await updateConsignmentStatus(eventCode, referenceNumber, reason);
        showToast(`Status successfully updated to ${eventCode}`);
        setTimeout(() => location.reload(), 2000);
      } catch (err) {
        console.error('[ChronoExt] Status update failed:', err);
        showToast('❌ Update failed. Check console.');
        btn.disabled = false;
        btn.textContent = 'Update';
      }
    });
  }

  async function updateConsignmentStatus(eventCode, referenceNumber) {
    if (!apiTokens) {
      throw new Error('API Tokens missing. Please refresh the page.');
    }

    const url = `https://projectxeuapi.shipsy.io/api/client/integration/consignment/event/${eventCode}`;
    const payload = {
      reference_number: referenceNumber,
      event_time_epoch: Math.floor(Date.now() / 1000)
    };

    const headers = { ...apiTokens, 'Content-Type': 'application/json' };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API Error ${res.status}: ${text}`);
    }

    return await res.json();
  }

  // Start preloading the Inscan iframe immediately on any page
  // so it's ready by the time the user reaches the recon page
  preloadInscanModal();

  console.log("[ChronoExt] Parcel Status extension loaded ✓");
})();

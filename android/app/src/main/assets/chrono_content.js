  // ── Mobile Viewport Enforcement ────────────────────────────
  (function() {
    try {
      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        (document.head || document.documentElement).appendChild(meta);
      }
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    } catch(e) {}
    
    try {
      window.addEventListener('scroll', function(e) {
        if (e.target && e.target.classList && typeof e.target.className === 'string' && e.target.className.indexOf('navbar-') !== -1) {
          if (e.target.scrollLeft !== 0) {
            e.target.scrollLeft = 0;
          }
        }
      }, true);

      // Boost z-index of open filter items so popovers float over action buttons and tables
      document.addEventListener('click', function(e) {
        setTimeout(function() {
          var menu = document.querySelector('.filter-menu, [class*="filter-menu"]');
          if (menu) {
            var item = menu.closest('.ant-form-item, [class*="formItem"], [class*="multiSelectFilter"]');
            if (item) {
              item.style.setProperty('z-index', '1000', 'important');
              item.style.setProperty('position', 'relative', 'important');
            }
          }
        }, 50);
      }, true);
    } catch(e) {}
  })();
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

  // intercept.js is injected by Android before this script runs

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

  function getCurrentHubId() {
    try {
      const stored = JSON.parse(localStorage.getItem('__CURRENT_HUB__') || '{}');
      if (stored && stored.id) return String(stored.id);
    } catch (_) {}
    return "2477050730750414061";
  }

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
      entries.codAmount = dataObj.cod_amount || (dataObj.data && dataObj.data.cod_amount) || "";

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
          status: status,
          reason: ev.reason || (ev.details && ev.details.reason) || "",
          hub: ev.hub_name || "",
          worker: ev.worker_name || ev.rider_name || (ev.details && ev.details.worker_name) || "",
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
   * Build a single-line status row with inline details and expandable history.
   * @param {Array<{status, color, time, reason, worker, hub}>} entries
   * @param {HTMLElement|null} cnHeader - optional header to host attempt/COD badges
   */
  function createStatusTimeline(entries, cnHeader = null) {
    // If cnHeader is provided, place attempt/COD badges inline in the header to save vertical space
    if (cnHeader && entries) {
      let badgesContainer = cnHeader.querySelector(".chrono-cn-badges");
      if (!badgesContainer) {
        badgesContainer = document.createElement("div");
        badgesContainer.className = "chrono-cn-badges";
        badgesContainer.style.cssText = "display: flex; gap: 4px; align-items: center; margin-left: auto;";
        cnHeader.appendChild(badgesContainer);
      }
      badgesContainer.innerHTML = "";

      if (entries.attempts && entries.attempts !== '0') {
        const attemptsBadge = document.createElement("span");
        attemptsBadge.className = "chrono-ext-attempts-badge";
        attemptsBadge.innerHTML = `Tentatives: <strong>${entries.attempts}</strong>`;
        badgesContainer.appendChild(attemptsBadge);
      }

      if (entries.codAmount && parseFloat(entries.codAmount) > 0) {
        const codBadge = document.createElement("span");
        codBadge.className = "chrono-ext-cod-badge";
        codBadge.innerHTML = `COD: <strong>${entries.codAmount} MAD</strong>`;
        badgesContainer.appendChild(codBadge);
      }
    }

    const container = document.createElement("div");
    container.className = "chrono-ext-status-timeline is-single-line";

    if (!entries || entries.length === 0) {
      container.innerHTML = `<span class="chrono-ext-status-text" style="color:#94a3b8; font-size:11.5px;">Aucun statut</span>`;
      return container;
    }

    const entry = entries[0];

    // Fallback if cnHeader wasn't passed but badges exist
    if (!cnHeader && ((entries.attempts && entries.attempts !== '0') || entries.codAmount)) {
      const topBadges = document.createElement("div");
      topBadges.className = "chrono-ext-top-badges";
      topBadges.style.cssText = "display: flex; gap: 4px; align-items: center; margin-bottom: 2px;";
      if (entries.attempts && entries.attempts !== '0') {
        const attemptsBadge = document.createElement("span");
        attemptsBadge.className = "chrono-ext-attempts-badge";
        attemptsBadge.innerHTML = `Tentatives: <strong>${entries.attempts}</strong>`;
        topBadges.appendChild(attemptsBadge);
      }
      if (entries.codAmount && parseFloat(entries.codAmount) > 0) {
        const codBadge = document.createElement("span");
        codBadge.className = "chrono-ext-cod-badge";
        codBadge.innerHTML = `COD: <strong>${entries.codAmount} MAD</strong>`;
        topBadges.appendChild(codBadge);
      }
      container.appendChild(topBadges);
    }

    // Error/timeout badge fallback
    if (entry.status === "Error" || entry.status === "Timeout" || entry.status === "Auth Error") {
      const line = document.createElement("div");
      line.className = "chrono-ext-status-line";
      line.innerHTML = `
        <span class="chrono-ext-log-dot" style="background:${entry.color || '#ef4444'}"></span>
        <span class="chrono-ext-log-status" style="color:#ef4444">${entry.status}</span>
      `;
      container.appendChild(line);
      return container;
    }

    // Build the ONE-LINE detailed status
    const line = document.createElement("div");
    line.className = "chrono-ext-status-line";

    const dot = document.createElement("span");
    dot.className = "chrono-ext-log-dot";
    dot.style.backgroundColor = entry.color || "#0088ce";

    const statusEl = document.createElement("span");
    statusEl.className = "chrono-ext-log-status is-current";
    statusEl.textContent = entry.status;

    // Build detail inline string: reason, worker, hub
    const details = [];
    if (entry.reason) details.push(`Motif: ${entry.reason}`);
    if (entry.worker) details.push(`Livreur: ${entry.worker}`);
    if (entry.hub) details.push(`Hub: ${entry.hub}`);

    line.appendChild(dot);
    line.appendChild(statusEl);

    if (details.length > 0) {
      const detailEl = document.createElement("span");
      detailEl.className = "chrono-ext-log-detail-inline";
      detailEl.textContent = `(${details.join(" • ")})`;
      line.appendChild(detailEl);
    }

    if (entry.time) {
      const timeEl = document.createElement("span");
      timeEl.className = "chrono-ext-log-time";
      timeEl.textContent = entry.time;
      line.appendChild(timeEl);
    }

    // If older history entries exist, add a compact toggle button (+N)
    if (entries.length > 1) {
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "chrono-ext-history-btn";
      toggleBtn.textContent = `+${entries.length - 1}`;
      toggleBtn.title = "Voir l'historique complet";

      let historyDropdown = null;
      toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (historyDropdown) {
          historyDropdown.remove();
          historyDropdown = null;
          toggleBtn.textContent = `+${entries.length - 1}`;
        } else {
          historyDropdown = document.createElement("div");
          historyDropdown.className = "chrono-ext-history-dropdown";
          for (let i = 1; i < entries.length; i++) {
            const h = entries[i];
            const hRow = document.createElement("div");
            hRow.className = "chrono-ext-history-item";
            const hDetails = [];
            if (h.reason) hDetails.push(`Motif: ${h.reason}`);
            if (h.worker) hDetails.push(`Livreur: ${h.worker}`);
            const hDetailsStr = hDetails.length > 0 ? ` (${hDetails.join(" • ")})` : "";
            hRow.innerHTML = `
              <span class="chrono-ext-log-dot" style="background:${h.color || '#94a3b8'}; width:6px; height:6px; min-width:6px;"></span>
              <span style="font-weight:600;">${h.status}</span>
              <span style="color:#64748b; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${hDetailsStr}</span>
              <span style="color:#94a3b8; font-size:10.5px; margin-left:auto; white-space:nowrap;">${h.time || ''}</span>
            `;
            historyDropdown.appendChild(hRow);
          }
          container.appendChild(historyDropdown);
          toggleBtn.textContent = "▲";
        }
      });

      line.appendChild(toggleBtn);
    }

    container.appendChild(line);
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
      const titleEl = modal.querySelector(".ant-modal-title");
      const t = titleEl ? titleEl.textContent.trim().toLowerCase() : "";

      const isScanTitle = t.includes("scan") ||
                          t.includes("inscan") ||
                          t.includes("outscan") ||
                          t.includes("arrival") ||
                          t.includes("arriv") ||
                          t.includes("manifest") ||
                          t.includes("run") ||
                          t.includes("bag") ||
                          t.includes("dispatch");

      const scanInput = modal.querySelector(
        'input[placeholder*="CN" i], input[placeholder*="consign" i], input[placeholder*="Scan" i], input[placeholder*="AWB" i], input[placeholder*="Bag" i], input[placeholder*="Run" i], input[placeholder*="Manifest" i], input[placeholder*="Arriv" i], input[placeholder*="Envoi" i], input[placeholder*="Code" i]'
      ) || modal.querySelector('.ant-input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');

      const hasTableOrList = modal.querySelector(".ant-table") || modal.querySelector(".ant-table-wrapper") || modal.querySelector("table") || modal.querySelector(".ant-empty");

      if (isScanTitle && (scanInput || hasTableOrList)) return modal;
      if (scanInput && hasTableOrList) return modal;
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
      if (window.innerWidth <= 768) {
        el.style.width = "96vw";
        el.style.maxWidth = "96vw";
        el.style.margin = "8px auto";
      } else {
        el.style.width = "1150px";
        el.style.maxWidth = "95vw";
      }
    }
  }

  // We intentionally do NOT modify the table headers or colgroups anymore.
  // Modifying React-controlled columns (<th>, <colgroup>) crashes the app 
  // when it tries to re-render, preventing new scans from appearing.

  // ── Scanner Trigger Delegation ────────────────────────────
  function hookScannerButtons(root = document) {
    if (!root) return;
    const triggers = root.querySelectorAll(
      '.ant-input-suffix, ' +
      '.ant-input-group-addon, ' +
      '.ant-input-group-addon button, ' +
      '[class*="scanIcon" i], ' +
      '[class*="barcode" i], ' +
      '[class*="scanner" i], ' +
      '.anticon-scan, ' +
      'button[aria-label*="scan" i], ' +
      'button[title*="scan" i]'
    );
    triggers.forEach(trigger => {
      const text = (trigger.textContent || '').trim().toLowerCase();
      if (text.includes('inscan at hub') || text.includes('outscan at hub') || text.includes('cns scanned') || text.includes('manifest')) return;
      trigger.style.cursor = 'pointer';
      trigger.style.minWidth = '44px';
      trigger.style.minHeight = '44px';
      trigger.style.display = 'inline-flex';
      trigger.style.alignItems = 'center';
      trigger.style.justifyContent = 'center';
      trigger.style.touchAction = 'manipulation';
      
      if (!trigger.hasAttribute('data-chrono-scanner-hooked')) {
        trigger.setAttribute('data-chrono-scanner-hooked', 'true');
        trigger.addEventListener('click', (e) => {
          const appBridge = window.AndroidApp || window.top?.AndroidApp || window.parent?.AndroidApp || (root.ownerDocument?.defaultView?.AndroidApp);
          if (appBridge && typeof appBridge.launchScanner === 'function') {
            e.preventDefault();
            e.stopImmediatePropagation();
            appBridge.launchScanner();
          }
        }, true);
      }
    });
  }

  function attachScannerDelegation(doc = document) {
    if (!doc || doc.__chronoScannerDelegated) return;
    try {
      doc.__chronoScannerDelegated = true;
      doc.addEventListener('click', (e) => {
        const appBridge = window.AndroidApp || window.top?.AndroidApp || window.parent?.AndroidApp || (doc.defaultView?.AndroidApp);
        if (!appBridge || typeof appBridge.launchScanner !== 'function') return;

        const target = e.target;
        if (!target) return;
        const trigger = target.closest(
          '.ant-input-suffix, ' +
          '.ant-input-group-addon, ' +
          '.ant-input-group-addon button, ' +
          '[class*="scanIcon" i], ' +
          '[class*="barcode" i], ' +
          '[class*="scanner" i], ' +
          '.anticon-scan, ' +
          'button[aria-label*="scan" i], ' +
          'button[title*="scan" i]'
        );
        if (trigger) {
          const text = (trigger.textContent || '').trim().toLowerCase();
          if (text.includes('inscan at hub') || text.includes('outscan at hub') || text.includes('cns scanned') || text.includes('manifest')) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          appBridge.launchScanner();
        }
      }, true);
    } catch (_) {}
  }

  // ── Import Excel button ────────────────────────────────────

  function ensureImportExcelButton(modal) {
    if (modal.querySelector('.chrono-ext-import-btn')) return;

    let scanInput = modal.querySelector(
      'input[placeholder*="CN" i], input[placeholder*="consign" i], input[placeholder*="Scan" i], input[placeholder*="AWB" i], input[placeholder*="Bag" i], input[placeholder*="Run" i], input[placeholder*="Manifest" i], input[placeholder*="Arriv" i], input[placeholder*="Envoi" i], input[placeholder*="Code" i]'
    );
    if (!scanInput) {
      const allInputs = Array.from(modal.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="date"])'));
      scanInput = allInputs.find(inp => inp.offsetParent !== null) || allInputs[0];
    }
    if (!scanInput) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls, .csv';
    fileInput.style.display = 'none';
    
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chrono-ext-import-btn';
    btn.textContent = 'Import Excel';
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async function(evt) {
        try {
          const buffer = evt.target.result;
          const data = new Uint8Array(buffer);
          const xlsxLib = typeof XLSX !== 'undefined' ? XLSX : (window.top?.XLSX || window.parent?.XLSX || (modal.ownerDocument && modal.ownerDocument.defaultView?.XLSX));
          
          if (!xlsxLib) {
            console.error('[ChronoExt] XLSX library not found in window or parent');
            alert('La bibliothèque Excel (XLSX) n\'est pas encore disponible. Veuillez patienter un instant ou réactualiser la page.');
            return;
          }

          const workbook = xlsxLib.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = xlsxLib.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (!rows || rows.length === 0) {
            alert('Le fichier Excel sélectionné est vide.');
            return;
          }

          const modalTitleEl = modal.querySelector('.ant-modal-title');
          const modalTitle = modalTitleEl ? modalTitleEl.textContent.toLowerCase() : '';
          const isOutscan = modalTitle.includes('outscan');
          
          // Determine where data starts (detect banner vs standard table vs raw list)
          let startRow = 0;
          for (let r = 0; r < Math.min(5, rows.length); r++) {
            const rowStr = (rows[r] || []).join(' ').toUpperCase();
            if (rowStr.includes("ACCUSE") || rowStr.includes("FUTURAMA") || rowStr.includes("CHRONODIALI") || rowStr.includes("BORDEREAU")) {
              startRow = 5; // Chrono/Futurama banner export, start at row 6
              break;
            }
          }
          if (startRow === 0 && rows.length > 1) {
            const firstRowStr = (rows[0] || []).join(' ').toLowerCase();
            if (firstRowStr.includes("cn") || firstRowStr.includes("tracking") || firstRowStr.includes("code") || 
                firstRowStr.includes("awb") || firstRowStr.includes("envoi") || firstRowStr.includes("colis") || 
                firstRowStr.includes("num") || firstRowStr.includes("ref")) {
              startRow = 1; // Header row, start at row 2
            }
          }

          let codes = [];
          const seen = new Set();

          function addCandidate(val) {
            if (val === null || val === undefined) return;
            const str = String(val).trim();
            if (str.length < 4) return;
            const upper = str.toUpperCase();
            if (upper.includes("ACCUSE") || upper.includes("FUTURAMA") || upper.includes("CHRONODIALI") || 
                upper.includes("BORDEREAU") || upper.includes("TRACKING") || upper.includes("TOTAL") ||
                upper.includes("DATE") || upper.includes("STATUT") || upper.includes("CLIENT")) {
              return;
            }
            if (!seen.has(str)) {
              seen.add(str);
              codes.push(str);
            }
          }

          for (let i = startRow; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row)) continue;
            
            if (isOutscan) {
              // Outscan can have codes across multiple columns
              for (let j = 0; j < row.length; j++) {
                addCandidate(row[j]);
              }
            } else {
              // Inscan / Arrival: primary column is column 0, or column 1 if column 0 was an index (e.g. 1, 2, 3)
              let addedFromRow = false;
              for (let j = 0; j < Math.min(row.length, 3); j++) {
                const cell = row[j];
                if (cell !== null && cell !== undefined) {
                  const s = String(cell).trim();
                  // Skip simple row index numbers like "1", "2"
                  if (/^\d{1,3}$/.test(s)) continue;
                  addCandidate(s);
                  addedFromRow = true;
                  break;
                }
              }
              // If not added yet, check column 0 anyway
              if (!addedFromRow && row[0] !== undefined) {
                addCandidate(row[0]);
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
              
              ['keydown', 'keypress', 'keyup'].forEach(eventType => {
                scanInput.dispatchEvent(new KeyboardEvent(eventType, {
                  key: 'Enter',
                  code: 'Enter',
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: true
                }));
              });
              
              await new Promise(r => setTimeout(r, 450));
            }
            
            btn.textContent = originalText;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
          } else {
            alert('Aucun code de suivi valide trouvé dans le fichier Excel.');
          }
        } catch (err) {
          console.error('[ChronoExt] Error parsing Excel', err);
          alert('Erreur lors de la lecture du fichier Excel: ' + (err.message || 'Format non supporté'));
        }
        fileInput.value = '';
      };
      reader.readAsArrayBuffer(file);
    });
    
    const groupWrapper = scanInput.closest('.ant-input-group-wrapper') || 
                         scanInput.closest('.ant-input-affix-wrapper') || 
                         scanInput.closest('.ant-input-wrapper') || 
                         scanInput.closest('.ant-space-item') || 
                         scanInput.parentElement;
    if (groupWrapper && groupWrapper.parentNode) {
      groupWrapper.parentNode.insertBefore(fileInput, groupWrapper.nextSibling);
      groupWrapper.parentNode.insertBefore(btn, fileInput.nextSibling);
    } else {
      const wrapper = scanInput.closest('.ant-space-item') || scanInput.parentElement;
      wrapper.appendChild(fileInput);
      wrapper.appendChild(btn);
    }

    hookScannerButtons(modal);
    attachScannerDelegation(modal.ownerDocument || document);
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
      const existingHeader = clone.querySelector(".chrono-cn-header");
      if (existingHeader) existingHeader.remove();
      
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
        cnTd.classList.add("chrono-ext-cn-cell");
        cnTd.style.display = "flex";
        cnTd.style.flexDirection = "column";
        cnTd.style.alignItems = "stretch";
        cnTd.style.gap = "2px";
        cnTd.style.padding = "4px 6px";

        let cnHeader = cnTd.querySelector(".chrono-cn-header");
        if (!cnHeader) {
          cnHeader = document.createElement("div");
          cnHeader.className = "chrono-cn-header";
          cnHeader.innerHTML = `<span class="chrono-cn-code">${cnCode}</span><div class="chrono-cn-badges"></div>`;
          
          // Hide or remove native Shipsy child nodes so they never collide with status
          Array.from(cnTd.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
              node.remove();
            } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains("chrono-cn-header") && !node.classList.contains("chrono-ext-status-container")) {
              node.style.display = "none";
            }
          });
          cnTd.prepend(cnHeader);
        }

        statusContainer = document.createElement("div");
        statusContainer.className = "chrono-ext-status-container";
        statusContainer.style.width = "100%";
        cnTd.appendChild(statusContainer);
        newlyCreated = true;
      }

      // Hide any stray native nodes inserted by React during re-render
      let cnHeader = cnTd.querySelector(".chrono-cn-header");
      Array.from(cnTd.childNodes).forEach(node => {
        if (node !== cnHeader && node !== statusContainer) {
          if (node.nodeType === Node.TEXT_NODE) node.remove();
          else if (node.nodeType === Node.ELEMENT_NODE) node.style.display = "none";
        }
      });

      // If we just recreated the container (due to React re-render) OR it's a completely new row
      if (newlyCreated || !row.hasAttribute(ATTR_PROCESSED)) {
        statusContainer.innerHTML = "";
        let cnHeader = cnTd.querySelector(".chrono-cn-header");
        
        if (statusCache.has(cnCode)) {
          // Instantly restore from cache if React wiped it out
          statusContainer.appendChild(createStatusTimeline(statusCache.get(cnCode), cnHeader));
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
                let currentHeader = row.querySelector(".chrono-cn-header");
                if (currentContainer) {
                  currentContainer.innerHTML = "";
                  currentContainer.appendChild(createStatusTimeline(entries, currentHeader));
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

    // Check if "Settlement Done!" is in reconciliation result notices and actually visible
    const candidates = document.querySelectorAll('.ant-result-title, .ant-message-notice, .ant-notification-notice, [class*="settleCOD-"]');
    let hasSettlementDone = false;
    for (const el of candidates) {
      if (el && window.getComputedStyle(el).display !== 'none' && (el.textContent || '').includes("Settlement Done!")) {
        hasSettlementDone = true;
        break;
      }
    }
    if (hasSettlementDone) {
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
      const wasConsignmentTab = typeof isConsignmentTabActive === 'function' && isConsignmentTabActive();
      setTimeout(() => {
        // Find reload button within active tab pane to avoid unintentional tab switching
        const activePane = Array.from(document.querySelectorAll('.ant-tabs-tabpane, [role="tabpanel"]')).find(pane => {
          return !pane.classList.contains('ant-tabs-tabpane-hidden') && pane.getAttribute('aria-hidden') !== 'true';
        });
        const reloadBtn = activePane?.querySelector('button .anticon-reload')?.closest('button')
          || document.querySelector('.chrono-reload-btn')
          || document.querySelector('button .anticon-reload')?.closest('button');
        if (reloadBtn) {
          reloadBtn.click();
          if (wasConsignmentTab) {
            // Restore consignment tab as soon as Shipsy finishes re-rendering
            let retries = 0;
            const restoreInterval = setInterval(() => {
              retries++;
              const tabs = Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]'));
              const consignmentTab = tabs.find(t => (t.innerText || '').toLowerCase().includes('consignment'));
              if (consignmentTab && !consignmentTab.classList.contains('ant-tabs-tab-active')) {
                consignmentTab.click();
              }
              if (retries >= 8 || (consignmentTab && consignmentTab.classList.contains('ant-tabs-tab-active'))) {
                clearInterval(restoreInterval);
              }
            }, 400);
          }
        }
      }, 300);
    }
  }

  function showInscanOverlay() {
    const overlay = document.querySelector('.chrono-iframe-overlay');
    if (overlay) {
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
      const iframe = overlay.querySelector('#chrono-inscan-iframe');
      if (overlay.dataset.ready === 'true') {
        const loadingEl = overlay.querySelector('.chrono-iframe-loading');
        if (loadingEl) loadingEl.style.display = 'none';
        if (iframe) iframe.style.opacity = '1';
      }
      try {
        const idoc = iframe?.contentDocument;
        if (idoc && !idoc.querySelector('.ant-modal-content')) {
          // Modal was removed (e.g. user submitted OK); recreate clean overlay
          overlay.remove();
          preloadInscanModal(true);
        }
      } catch (e) {}
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
      <iframe id="chrono-inscan-iframe" src="/ops/consignments" allow="camera; microphone; autoplay; clipboard-write;"></iframe>
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
        
        try {
          if (doc.defaultView && !doc.defaultView.XLSX && (window.XLSX || window.top?.XLSX)) {
            doc.defaultView.XLSX = window.XLSX || window.top?.XLSX;
          }
        } catch (e) {}

        attachScannerDelegation(doc);
        hookScannerButtons(doc.body || doc);
        
        // Hide standard layout elements and ensure clean mobile responsiveness
        const style = doc.createElement('style');
        style.id = "chrono-iframe-style";
        style.textContent = `
          header, .ant-layout-header, .ant-layout-sider, .top-bar, .ant-pro-sider { display: none !important; }
          #root { display: none !important; }
          .ant-layout, .ant-layout-content { margin: 0 !important; padding: 0 !important; background: transparent !important; }
          body { background: transparent !important; overflow: hidden !important; }
          .ant-modal-mask { background: rgba(0, 0, 0, 0.55) !important; }
          .ant-modal-wrap { 
            position: fixed !important;
            inset: 0 !important;
            z-index: 1000 !important; 
            overflow-y: auto !important; 
            padding: 4px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .ant-modal { 
            width: 98vw !important; 
            max-width: 98vw !important; 
            margin: auto !important; 
            top: 0 !important;
            padding-bottom: 0 !important;
          }
          @media (min-width: 769px) {
            .ant-modal {
              width: 1000px !important;
              max-width: 95vw !important;
            }
          }
          .ant-modal-content { 
            border-radius: 14px !important; 
            max-height: 94vh !important; 
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important; 
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35) !important;
          }
          .ant-modal-header {
            padding: 12px 14px !important;
            border-bottom: 1px solid #f0f0f0 !important;
          }
          .ant-modal-title {
            font-size: 17px !important;
            font-weight: 700 !important;
            color: #1e293b !important;
          }
          .ant-modal-close {
            top: 10px !important;
            right: 10px !important;
            width: 38px !important;
            height: 38px !important;
          }
          .ant-modal-close-x {
            width: 38px !important;
            height: 38px !important;
            line-height: 38px !important;
            font-size: 16px !important;
          }
          .ant-modal-body { 
            max-height: calc(92vh - 120px) !important; 
            overflow-y: auto !important; 
            padding: 10px 8px !important; 
          }
          .ant-modal-footer {
            padding: 8px 14px !important;
            border-top: 1px solid #f0f0f0 !important;
            display: flex !important;
            justify-content: flex-end !important;
            gap: 8px !important;
          }
          .ant-modal-footer button {
            min-height: 40px !important;
            padding: 0 20px !important;
            border-radius: 6px !important;
            font-weight: 600 !important;
            font-size: 14px !important;
          }

          /* Scan input field styling */
          input[placeholder*="Add consignments"],
          input[placeholder*="consignments"] {
            height: 44px !important;
            font-size: 15px !important;
            border-radius: 8px !important;
            border: 1.5px solid #0088ce !important;
          }

          /* Import Excel button */
          .chrono-ext-import-btn,
          button.chrono-ext-import-btn {
            margin-top: 6px !important;
            margin-bottom: 6px !important;
            height: 36px !important;
            font-size: 13px !important;
            border-radius: 6px !important;
          }

          /* Modal table styling */
          .ant-table-wrapper { 
            width: 100% !important; 
            overflow-x: auto !important; 
            margin-top: 6px !important;
          }
          .ant-table {
            width: 100% !important;
            font-size: 13px !important;
          }
          .ant-table th, .ant-table td {
            padding: 6px 4px !important;
          }
          .ant-table-tbody > tr > td:first-child,
          .ant-table-thead > tr > th:first-child {
            width: 34px !important;
            min-width: 34px !important;
            max-width: 38px !important;
            padding: 6px 2px !important;
            text-align: center !important;
          }
          .ant-table-tbody > tr > td:last-child,
          .ant-table-thead > tr > th:last-child {
            width: 44px !important;
            min-width: 44px !important;
            max-width: 48px !important;
            padding: 6px 2px !important;
            text-align: center !important;
          }

          /* Status container and cards inside modal */
          .chrono-ext-cn-cell {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 2px !important;
            width: 100% !important;
            padding: 4px 6px !important;
            box-sizing: border-box !important;
          }
          .chrono-cn-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            width: 100% !important;
            gap: 6px !important;
            padding-bottom: 1px !important;
          }
          .chrono-cn-code {
            font-weight: 700 !important;
            font-size: 13.5px !important;
            color: #0f172a !important;
            letter-spacing: 0.3px !important;
          }
          .chrono-cn-badges {
            display: flex !important;
            align-items: center !important;
            gap: 4px !important;
            margin-left: auto !important;
          }
          .chrono-ext-status-container {
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .chrono-ext-status-timeline {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
            background: #f8fafc !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 6px !important;
            padding: 3px 6px !important;
            box-sizing: border-box !important;
          }
          .chrono-ext-status-timeline.is-single-line {
            padding: 3px 6px !important;
          }
          .chrono-ext-status-line {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            width: 100% !important;
            font-size: 12px !important;
            line-height: 1.25 !important;
            overflow: hidden !important;
          }
          .chrono-ext-attempts-badge {
            display: inline-flex !important;
            align-items: center !important;
            background: #fee2e2 !important;
            color: #b91c1c !important;
            border: 1px solid #fca5a5 !important;
            border-radius: 4px !important;
            font-size: 10.5px !important;
            font-weight: 600 !important;
            padding: 1px 6px !important;
          }
          .chrono-ext-cod-badge {
            display: inline-flex !important;
            align-items: center !important;
            background: #ecfdf5 !important;
            color: #047857 !important;
            border: 1px solid #a7f3d0 !important;
            border-radius: 4px !important;
            font-size: 10.5px !important;
            font-weight: 600 !important;
            padding: 1px 6px !important;
          }
          .chrono-ext-log-dot {
            display: inline-block !important;
            width: 7px !important;
            height: 7px !important;
            min-width: 7px !important;
            border-radius: 50% !important;
            flex-shrink: 0 !important;
            box-shadow: 0 0 0 1.5px rgba(255,255,255,0.9) !important;
          }
          .chrono-ext-log-status {
            font-size: 12.5px !important;
            font-weight: 700 !important;
            color: #1e293b !important;
            white-space: nowrap !important;
            flex-shrink: 0 !important;
          }
          .chrono-ext-log-status.is-current {
            color: #0f172a !important;
          }
          .chrono-ext-log-detail-inline {
            font-size: 11px !important;
            color: #64748b !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            flex: 1 1 auto !important;
            min-width: 0 !important;
          }
          .chrono-ext-log-time {
            font-size: 10.5px !important;
            font-weight: 600 !important;
            color: #475569 !important;
            background: #e2e8f0 !important;
            padding: 1px 5px !important;
            border-radius: 4px !important;
            white-space: nowrap !important;
            margin-left: auto !important;
            flex-shrink: 0 !important;
          }
          .chrono-ext-history-btn {
            background: #e2e8f0 !important;
            color: #475569 !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 4px !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            padding: 1px 5px !important;
            cursor: pointer !important;
            flex-shrink: 0 !important;
            line-height: 14px !important;
          }
          .chrono-ext-history-btn:hover {
            background: #cbd5e1 !important;
          }
          .chrono-ext-history-dropdown {
            margin-top: 4px !important;
            padding-top: 4px !important;
            border-top: 1px dashed #cbd5e1 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 3px !important;
          }
          .chrono-ext-history-item {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            font-size: 11px !important;
            color: #64748b !important;
          }
          .chrono-ext-status-badge {
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            padding: 3px 8px !important;
            border-radius: 12px !important;
            background: rgba(0, 0, 0, 0.05) !important;
            font-size: 12px !important;
          }
          .chrono-ext-status-badge[data-error="true"] {
            background: #fee2e2 !important;
            color: #b91c1c !important;
          }
          .chrono-ext-spinner {
            display: inline-block !important;
            width: 14px !important;
            height: 14px !important;
            border: 2px solid rgba(0, 0, 0, 0.15) !important;
            border-top-color: #1890ff !important;
            border-radius: 50% !important;
            animation: chrono-ext-spin 0.6s linear infinite !important;
            flex-shrink: 0 !important;
          }
          @keyframes chrono-ext-spin {
            to { transform: rotate(360deg); }
          }
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
            
            try {
              if (doc.defaultView && !doc.defaultView.XLSX && (window.XLSX || window.top?.XLSX)) {
                doc.defaultView.XLSX = window.XLSX || window.top?.XLSX;
              }
            } catch (e) {}

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
                if (btn && btn.textContent.trim().toLowerCase() === 'cancel' && btn.closest('.ant-modal-footer')) {
                  isCancel = true;
                }
                const wrap = e.target.closest('.ant-modal-wrap');
                const isMaskClick = wrap && e.target === wrap;

                if (closeBtn || isCancel || isMaskClick) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                  hideInscanOverlay();
                  return;
                }

                // If user clicks OK in modal footer, watch for completion to hide overlay and reload parent
                let isOk = false;
                if (btn && btn.textContent.trim().toLowerCase() === 'ok' && btn.closest('.ant-modal-footer')) {
                  isOk = true;
                }
                if (isOk) {
                  setTimeout(() => {
                    hideInscanOverlay(true);
                  }, 800);
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

  // ── Cash Balance: Check All Delivered & Settle Helper ────────

  function checkAllDeliveredParcelsOnPage() {
    // 1. Try clicking the header "Select All" checkbox first
    const headerCb = document.querySelector('thead .ant-table-selection-column input[type="checkbox"], thead input[type="checkbox"]');
    const headerWrap = document.querySelector('thead .ant-table-selection-column .ant-checkbox-wrapper, thead .ant-table-selection-column .ant-checkbox') || headerCb;
    
    if (headerCb && !headerCb.checked && headerWrap) {
      headerWrap.click();
    }

    // 2. Click any remaining unchecked row checkboxes
    setTimeout(() => {
      const rows = document.querySelectorAll('tbody tr.ant-table-row, tbody tr');
      rows.forEach(r => {
        const cb = r.querySelector('.ant-table-selection-column input[type="checkbox"], .ant-checkbox-input, input[type="checkbox"]');
        const wrap = r.querySelector('.ant-checkbox-wrapper, .ant-checkbox') || cb;
        if (cb && !cb.checked && wrap) {
          wrap.click();
        }
      });
    }, 60);
  }

  function ensureCashBalanceSettleHelper() {
    if (!location.pathname.includes("/ops/reconciliation/recon/")) return;

    // Only apply on the Cash Balance tab
    const currentTab = getActiveReconciliationTab();
    if (currentTab !== 'cash') {
      const existingBtn = document.getElementById('chrono-check-all-delivered-btn');
      if (existingBtn) existingBtn.remove();
      return;
    }

    // Attach click listeners to tabs so tab switches instantly trigger update
    const tabHeaders = document.querySelectorAll('.ant-tabs-tab, [role="tab"]');
    tabHeaders.forEach(tab => {
      if (!tab.dataset.chronoCashTabListener) {
        tab.dataset.chronoCashTabListener = 'true';
        tab.addEventListener('click', () => {
          setTimeout(ensureCashBalanceSettleHelper, 30);
          setTimeout(ensureCashBalanceSettleHelper, 150);
          setTimeout(ensureCashBalanceSettleHelper, 350);
        });
      }
    });

    // Extract Balance value from label, e.g. "Balance: 8610.80" or .Component-detailLabel-...
    let balanceVal = 0.0;
    const balanceElements = Array.from(document.querySelectorAll('[class*="detailLabel"], [class*="balanceHeader"], [class*="settleBalance"], span, div, p'));
    for (const el of balanceElements) {
      if (el.children.length > 0) continue;
      const text = el.textContent || '';
      const m = text.match(/Balance\s*:\s*([\d\.,]+)/i);
      if (m) {
        balanceVal = parseFloat(m[1].replace(/,/g, ''));
        break;
      }
    }

    // Read Settle Amount input
    const settleInput = document.querySelector('input[placeholder="Settle Amount"], input.ant-input-number-input[placeholder*="Settle" i], input.ant-input-number-input[aria-valuenow]');
    let currentSettleAmt = 0.0;
    if (settleInput) {
      const rawVal = settleInput.getAttribute('aria-valuenow') || settleInput.value || '0';
      currentSettleAmt = parseFloat(rawVal.replace(/,/g, '')) || 0.0;
    }

    // Locate the Reconcile / Settle / Cancel buttons
    const activePane = Array.from(document.querySelectorAll('.ant-tabs-tabpane, [role="tabpanel"]')).find(pane => {
      const isHidden = pane.classList.contains('ant-tabs-tabpane-hidden') ||
                       pane.getAttribute('aria-hidden') === 'true' ||
                       pane.offsetParent === null;
      if (isHidden) return false;
      const t = pane.textContent.toLowerCase();
      return t.includes('amount collected') || t.includes('payment mo') || t.includes('balance:');
    });

    const buttons = activePane
      ? Array.from(activePane.querySelectorAll('button, .ant-btn, [role="button"]')).filter(b => b.offsetParent !== null)
      : Array.from(document.querySelectorAll('button, .ant-btn, [role="button"]')).filter(b => b.offsetParent !== null);

    const settleBtn = buttons.find(b => {
      const t = b.textContent.trim().toLowerCase();
      return t === 'settle' || t === 'reconcile' || t === 'réconcilier' || t === 'reconcilier' || t === 'régler' || t === 'regler' || t === 'settlement';
    });
    if (settleBtn) {
      settleBtn.classList.add('chrono-settle-btn');
    }
    const cancelBtn = buttons.find(b => {
      const t = b.textContent.trim().toLowerCase();
      return t === 'cancel' || t === 'annuler';
    });

    const anchorBtn = cancelBtn || settleBtn;
    if (!anchorBtn || !anchorBtn.parentElement) return;

    const container = anchorBtn.parentElement;
    container.classList.add('chrono-settlement-actions-form');
    container.style.setProperty('height', 'auto', 'important');
    container.style.setProperty('max-height', 'none', 'important');
    container.style.setProperty('display', 'flex', 'important');
    container.style.setProperty('flex-direction', 'column', 'important');
    container.style.setProperty('overflow', 'visible', 'important');

    if (container.parentElement) {
      container.parentElement.style.setProperty('height', 'auto', 'important');
      container.parentElement.style.setProperty('max-height', 'none', 'important');
      container.parentElement.style.setProperty('display', 'flex', 'important');
      container.parentElement.style.setProperty('flex-direction', 'column', 'important');
      container.parentElement.style.setProperty('overflow', 'visible', 'important');
    }

    // Check table rows and checkboxes
    const rowCheckboxes = Array.from(document.querySelectorAll('tbody tr .ant-table-selection-column input[type="checkbox"], tbody tr .ant-checkbox-input, tbody tr input[type="checkbox"]'));
    const uncheckedBoxes = rowCheckboxes.filter(cb => !cb.checked);
    const totalRows = rowCheckboxes.length;

    // Auto-check on first load if unchecked rows exist and balance > 0
    if (totalRows > 0 && uncheckedBoxes.length > 0 && container.dataset.chronoAutoChecked !== location.pathname) {
      container.dataset.chronoAutoChecked = location.pathname;
      checkAllDeliveredParcelsOnPage();
    }

    // Create or update our "Tout Cocher pour Règlement" button
    let checkAllBtn = document.getElementById('chrono-check-all-delivered-btn');
    if (!checkAllBtn) {
      checkAllBtn = document.createElement('button');
      checkAllBtn.id = 'chrono-check-all-delivered-btn';
      checkAllBtn.type = 'button';
      checkAllBtn.className = 'ant-btn ant-btn-primary';
      checkAllBtn.style.color = '#ffffff';
      checkAllBtn.style.fontWeight = 'bold';
      checkAllBtn.style.width = '100%';
      checkAllBtn.style.minHeight = '44px';
      checkAllBtn.style.margin = '4px 0';
      checkAllBtn.style.borderRadius = '8px';

      container.insertBefore(checkAllBtn, anchorBtn);

      checkAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        checkAllDeliveredParcelsOnPage();
      });
    }

    const isFullyChecked = totalRows > 0 && uncheckedBoxes.length === 0;
    const isAmountIdentical = balanceVal > 0 && Math.abs(currentSettleAmt - balanceVal) < 0.05;

    if (isFullyChecked || isAmountIdentical) {
      checkAllBtn.style.background = '#389e0d';
      checkAllBtn.style.borderColor = '#389e0d';
      const amtFmt = balanceVal > 0 ? `${balanceVal.toFixed(2)} MAD` : `${totalRows} colis`;
      checkAllBtn.innerHTML = `<span>✔ Montant Vérifié : ${amtFmt}</span>`;
    } else {
      checkAllBtn.style.background = '#52c41a';
      checkAllBtn.style.borderColor = '#52c41a';
      checkAllBtn.innerHTML = `<span>☑ Tout Cocher pour Règlement (${uncheckedBoxes.length} restants)</span>`;
    }
  }

  // ── Reconciliation Action Button Labels (Excel & Actualiser) ───

  function ensureReconciliationActionLabels() {
    if (!location.pathname.includes("/ops/reconciliation/recon/")) return;

    // Excel export button
    const downloadSvgs = document.querySelectorAll('.anticon-download');
    downloadSvgs.forEach(svg => {
      const btn = svg.closest('button');
      if (btn && !btn.dataset.chronoLabeled) {
        btn.dataset.chronoLabeled = 'true';
        btn.classList.add('chrono-excel-btn');
        const span = document.createElement('span');
        span.textContent = ' Excel';
        btn.appendChild(span);
      }
    });

    // Reload button on Tab 0 (Cash) and Tab 2 (Non-Cash)
    const activeTab = getActiveReconciliationTab();
    if (activeTab === 'cash' || activeTab === 'non-cash') {
      const reloadSvgs = document.querySelectorAll('[class*="settlementContainer-"] .anticon-reload, [class*="settleBalance-"] .anticon-reload');
      reloadSvgs.forEach(svg => {
        const btn = svg.closest('button');
        if (btn && !btn.dataset.chronoLabeled) {
          btn.dataset.chronoLabeled = 'true';
          btn.classList.add('chrono-reload-btn');
          const span = document.createElement('span');
          span.textContent = ' Actualiser';
          btn.appendChild(span);
        }
      });
    }
  }

  function ensureNonCashBalanceHelper() {
    if (!location.pathname.includes("/ops/reconciliation/recon/")) return;
    const currentTab = getActiveReconciliationTab();
    if (currentTab !== 'non-cash') return;

    const activePane = Array.from(document.querySelectorAll('.ant-tabs-tabpane, [role="tabpanel"]')).find(pane => {
      const isHidden = pane.classList.contains('ant-tabs-tabpane-hidden') ||
                       pane.getAttribute('aria-hidden') === 'true' ||
                       pane.offsetParent === null;
      if (isHidden) return false;
      return pane.textContent.includes('Payment Mode');
    });

    if (activePane) {
      const settleBtn = Array.from(activePane.querySelectorAll('button, .ant-btn')).find(b => {
        const t = b.textContent.trim().toLowerCase();
        return t === 'settle' || t === 'reconcile' || t === 'régler' || t === 'regler';
      });
      if (settleBtn) {
        settleBtn.classList.add('chrono-settle-btn');
      }
    }
  }

  // ── Fix Dropdown z-index Stacking on Rider List ─────────────
  function fixRiderDropdownStacking() {
    if (!location.pathname.includes("/ops/reconciliation/rider-list")) return;

    if (!document.__chronoDropdownStackingAttached) {
      document.__chronoDropdownStackingAttached = true;

      document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target) return;

        const filterBtn = target.closest('[class*="multiSelectFilter"], [class*="selectButton"], [class*="select-btn"], button, [class*="filter-menu"]');
        const filterRows = Array.from(document.querySelectorAll('[class*="filterRow-"]'));

        if (filterBtn) {
          const clickedRow = filterBtn.closest('[class*="filterRow-"]');
          if (clickedRow) {
            filterRows.forEach(row => {
              if (row === clickedRow) {
                row.style.setProperty('z-index', '10005', 'important');
              } else {
                row.style.setProperty('z-index', '1', 'important');
              }
            });
            return;
          }
        }

        // When clicking outside or closing dropdown, reset after brief delay
        setTimeout(() => {
          const hasOpenMenu = document.querySelector('[class*="filter-menu"]:not([style*="display: none"]), [class*="menuItemLayout"], .ant-dropdown:not(.ant-dropdown-hidden)');
          if (!hasOpenMenu) {
            filterRows.forEach(row => {
              row.style.removeProperty('z-index');
            });
          }
        }, 150);
      }, true);
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

      // Also insert a direct shortcut to Rider Settlement Amounts
      if (!document.querySelector('.chrono-ext-recon-settlements-btn')) {
        const settleBtn = document.createElement('button');
        settleBtn.className = resetBtn.className + " chrono-ext-recon-settlements-btn";
        settleBtn.style.color = '#389e0d';
        settleBtn.style.fontWeight = '600';
        settleBtn.innerHTML = `<span>💰 Règlements Livreur</span>`;
        settleBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showRiderSettlementModal();
        });
        container.appendChild(settleBtn);
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
        "hub_id": getCurrentHubId(),
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
        hub_id: getCurrentHubId(),
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
    // In WebView: fetch template from injected base64 or use fallback blank workbook
    const templateUrl = null; // template fetch handled below
    let wb;
    if (templateUrl) {
      const response = await fetch(templateUrl);
      if (!response.ok) throw new Error('Impossible de charger le template Excel');
      const arrayBuffer = await response.arrayBuffer();
      wb = await XlsxPopulate.fromDataAsync(arrayBuffer);
    } else {
      wb = await XlsxPopulate.fromBlankAsync();
    }
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
      
      // Reset horizontal scroll so search bar is not pushed offscreen
      const tools = document.querySelector('[class*="filterGroupToolsRight-"]');
      if (tools) tools.scrollLeft = 0;
      
      // 3. Date Range Preset: Keep default or select today to avoid 5000+ parcels freezing the device
      // (User can manually change date if needed)
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

  function ensureFilterToggle() {
    if (!location.pathname.includes('/ops/consignments')) {
      const existingBtn = document.getElementById('chrono-filter-toggle-btn');
      if (existingBtn) existingBtn.remove();
      return;
    }
    const filterWrapper = document.querySelector('[class*="filterBarWrapper-"]');
    if (!filterWrapper) return;
    
    let toggleBtn = document.getElementById('chrono-filter-toggle-btn');
    if (!toggleBtn) {
      toggleBtn = document.createElement('button');
      toggleBtn.id = 'chrono-filter-toggle-btn';
      toggleBtn.type = 'button';
      toggleBtn.className = 'ant-btn ant-btn-sm';
      toggleBtn.style.cssText = 'height: 38px; min-height: 38px; font-size: 13px; border-radius: 8px; background: #e6f7ff; border: 1.5px solid #0088CE; color: #0088CE; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; flex: 0 0 auto; padding: 0 14px; margin-right: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); touch-action: manipulation;';
      toggleBtn.innerHTML = '🔍 Filtres <span style="font-size: 10px;">▼</span>';
      
      const actionsBar = document.querySelector('[class*="actionsBar-"]') || document.querySelector('[class*="actionBar-"]');
      if (actionsBar) {
        actionsBar.insertBefore(toggleBtn, actionsBar.firstChild);
      } else {
        filterWrapper.parentNode.insertBefore(toggleBtn, filterWrapper);
      }
      
      // Collapsed by default on mobile so table is immediately visible without scrolling
      filterWrapper.classList.add('chrono-filters-hidden');
      filterWrapper.style.setProperty('display', 'none', 'important');
      const divider = filterWrapper.nextElementSibling;
      const isDivider = divider && divider.className && divider.className.includes('filterActionDivider-');
      if (isDivider) divider.style.setProperty('display', 'none', 'important');
      
      let isVisible = false;
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        isVisible = !isVisible;
        if (isVisible) {
          filterWrapper.classList.remove('chrono-filters-hidden');
          filterWrapper.style.removeProperty('display');
          if (isDivider) divider.style.setProperty('display', 'none', 'important');
          toggleBtn.innerHTML = '🔍 Masquer <span style="font-size: 10px;">▲</span>';
        } else {
          filterWrapper.classList.add('chrono-filters-hidden');
          filterWrapper.style.setProperty('display', 'none', 'important');
          if (isDivider) divider.style.setProperty('display', 'none', 'important');
          toggleBtn.innerHTML = '🔍 Filtres <span style="font-size: 10px;">▼</span>';
        }
      });
    } else {
      const actionsBar = document.querySelector('[class*="actionsBar-"]') || document.querySelector('[class*="actionBar-"]');
      if (actionsBar && toggleBtn.parentNode !== actionsBar) {
        actionsBar.insertBefore(toggleBtn, actionsBar.firstChild);
      }
    }
  }

  let lastSideMenuToggle = 0;
  function triggerSideMenu() {
    const now = Date.now();
    if (now - lastSideMenuToggle < 400) return false;
    lastSideMenuToggle = now;
    const hamburger = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
    const nav = document.querySelector('header') || document.querySelector('[class*="navbar-"]');
    for (const elem of [hamburger, nav]) {
      if (!elem) continue;
      const k = Object.keys(elem).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      let cur = elem[k];
      while (cur) {
        if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
          cur.memoizedProps.toggleSideMenu();
          return true;
        }
        cur = cur.return;
      }
    }
    return false;
  }

  function enableTabSwiping() {
    const wraps = document.querySelectorAll('.ant-tabs-nav-wrap, [role="tablist"]');
    wraps.forEach(wrap => {
      if (wrap.hasAttribute('data-chrono-tab-swipe')) return;
      wrap.setAttribute('data-chrono-tab-swipe', 'true');
      let startX = 0;
      let startScroll = 0;
      let isDown = false;
      wrap.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        startX = e.touches[0].pageX;
        startScroll = wrap.scrollLeft;
        isDown = true;
      }, { passive: true });
      wrap.addEventListener('touchmove', (e) => {
        if (!isDown || e.touches.length !== 1) return;
        const diff = startX - e.touches[0].pageX;
        wrap.scrollLeft = startScroll + diff;
      }, { passive: true });
      wrap.addEventListener('touchend', () => { isDown = false; }, { passive: true });
      wrap.addEventListener('touchcancel', () => { isDown = false; }, { passive: true });
    });
  }

  function ensureMobileNavbar() {
    const hamburger = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
    if (hamburger && !hamburger.hasAttribute('data-chrono-bound')) {
      hamburger.setAttribute('data-chrono-bound', 'true');
      hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerSideMenu();
      }, true);
    }

    // Auto-close drawer ONLY when a leaf navigation link inside the submenu is clicked (not main menu category)
    const drawer = document.querySelector('.ant-drawer');
    if (drawer && !drawer.hasAttribute('data-chrono-bound')) {
      drawer.setAttribute('data-chrono-bound', 'true');
      drawer.addEventListener('click', (e) => {
        const link = e.target.closest('[class*="submenu-"] a, .ant-drawer-body a[href]:not([href="#"]):not([href^="javascript"])');
        if (link) {
          setTimeout(() => {
            const mask = document.querySelector('.ant-drawer-mask');
            if (mask) mask.click();
            const nav = document.querySelector('header') || document.querySelector('[class*="navbar-"]');
            if (nav) {
              const k = Object.keys(nav).find(k => k.startsWith('__reactFiber'));
              let cur = nav[k];
              while (cur) {
                if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
                  const d = document.querySelector('.ant-drawer-open');
                  if (d) cur.memoizedProps.toggleSideMenu();
                  break;
                }
                cur = cur.return;
              }
            }
          }, 200);
        }
      }, true);
    }

    // Keep horizontal scroll at 0 for tools so search bar is not hidden
    const tools = document.querySelector('[class*="filterGroupToolsRight-"]');
    if (tools && tools.scrollLeft < 0) {
      tools.scrollLeft = 0;
    }

    // Sync page title dynamically with native Android toolbar
    try {
      const pageTitleEl = document.querySelector('[class*="pageTitle-"]');
      let currentTitle = pageTitleEl ? pageTitleEl.innerText.trim() : document.title;
      if (currentTitle && window.AndroidApp && typeof window.AndroidApp.updateTitle === 'function') {
        window.AndroidApp.updateTitle(currentTitle);
      }
    } catch(e) {}
  }

  // ── Debounced observer to ensure buttery-smooth 60 FPS scrolling on tables ──
  let debounceTimer = null;
  function runDomEnhancements() {
    attachScannerDelegation(document);
    hookScannerButtons(document.body);
    checkReconciliationToast();
    fixRiderDropdownStacking();
    ensureInscanButton();
    ensureVerifyCompletedButton();
    ensureCashBalanceSettleHelper();
    ensureNonCashBalanceHelper();
    ensureReconciliationActionLabels();
    ensureDefaultFilters();
    ensureSalaryExportButton();
    ensureSettlementMenu();
    ensureFilterToggle();
    ensureMobileNavbar();
    enableTabSwiping();
    
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
  }

  const bodyObserver = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runDomEnhancements, 300);
  });

  bodyObserver.observe(document.body, { childList: true, subtree: true });

  // SPA Route Change Hooks for instant UI enhancement on navigation
  (function hookHistory() {
    try {
      const origPush = history.pushState;
      history.pushState = function() {
        const res = origPush.apply(this, arguments);
        window.dispatchEvent(new Event('chronoroutechange'));
        return res;
      };
      const origReplace = history.replaceState;
      history.replaceState = function() {
        const res = origReplace.apply(this, arguments);
        window.dispatchEvent(new Event('chronoroutechange'));
        return res;
      };
      window.addEventListener('popstate', () => {
        setTimeout(runDomEnhancements, 100);
      });
      window.addEventListener('chronoroutechange', () => {
        setTimeout(runDomEnhancements, 50);
        setTimeout(runDomEnhancements, 250);
        setTimeout(runDomEnhancements, 600);
      });
    } catch(e) {}
  })();

  // Periodic check (every 3s, not 1s, to save CPU/battery)
  setInterval(runDomEnhancements, 3000);

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

  window.showRiderSettlementModal = showRiderSettlementModal;
  window.chronoShowRiderSettlementModal = showRiderSettlementModal;

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
                  <th style="text-align: center; width: 90px;">Colis</th>
                  <th style="text-align: right; width: 170px;">Montant (MAD)</th>
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
          const delCount = item.deliveredCount != null && item.deliveredCount > 0 
            ? item.deliveredCount 
            : (item.parcels && item.parcels.length > 0 ? item.parcels.length : (item.count || 0));

          totalCount += delCount;
          totalAmt += (item.amount || 0);

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
              <span style="background:#e6f7ff; color:#1890ff; padding:2px 8px; border-radius:10px; font-weight:600; font-size:12px;" title="${delCount} Livrés / ${item.undeliveredCount || 0} Non livrés">
                ${delCount} livrés
              </span>
              ${item.undeliveredCount > 0 ? `<div style="font-size:11px; color:#ff4d4f; margin-top:2px; font-weight:500;">${item.undeliveredCount} non-livrés</div>` : ''}
            </td>
            <td style="text-align: right; font-weight: 600; color: #262626;">
              <div style="font-size:14px; font-weight:700; color:#1e293b;">${(item.amount || 0).toFixed(2)} MAD</div>
              ${item.settledAmount > 0 
                ? `<div style="font-size:11px; color:#389e0d; font-weight:600;">✔ Réglé${item.collectedAmount > 0 && Math.abs(item.collectedAmount - item.settledAmount) > 0.01 ? ` <span style="font-weight:normal; color:#8c8c8c;">(Col: ${item.collectedAmount.toFixed(2)})</span>` : ''}</div>`
                : (item.collectedAmount > 0 
                    ? `<div style="font-size:11px; color:#1890ff; font-weight:600;">⏳ CRBT (À régler)</div>` 
                    : (item.amount > 0 ? `<div style="font-size:11px; color:#fa8c16;">Crédits Course</div>` : '<div style="font-size:11px; color:#8c8c8c;">0.00 MAD</div>'))}
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
                  Colis pour ${item.name} (<span class="chrono-sub-count">${delCount} livrés</span>${item.undeliveredCount > 0 ? `, <span style="color:#ff4d4f;">${item.undeliveredCount} non-livrés</span>` : ''}) :
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
        ["Livreur", "N° Course", "Colis Livrés", "Colis Non-Livrés", "Total Colis", "Montant (MAD)", "Montant Réglé (MAD)", "Montant Collecté CRBT (MAD)", "Statut Règlement", "Reconciled By", "Statut Course"],
        ...currentRiders.map(d => [
          d.name,
          d.code,
          d.count || d.deliveredCount || 0,
          d.undeliveredCount || 0,
          d.totalCount || d.count || 0,
          d.amount,
          d.settledAmount || 0,
          d.collectedAmount || 0,
          d.settledAmount > 0 ? 'Réglé' : (d.collectedAmount > 0 ? 'CRBT Collecté (À Régler)' : 'N.A.'),
          d.cashier || Array.from(new Set((d.parcels || []).map(p => p.employee_name).filter(Boolean))).join(', ') || 'N.A.',
          d.status === 'in_transit' ? 'En course' : 'Terminée'
        ]),
        ["TOTAL HUB", "", parseInt(totalCountEl.textContent, 10), "", "", parseFloat(totalAmountEl.textContent), "", "", "", "", ""]
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
    
    // Parse date into DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
    const [year, month, day] = dateStr.split('-');
    const dmySlash = `${day}/${month}/${year}`;
    const dmyDash = `${day}-${month}-${year}`;

    // Dynamically retrieve current hub
    const hubId = getCurrentHubId();

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
            hub_id: hubId,
            bucket: "retail_completed"
          })
        }),
        fetch(tripUrl, {
          method: "POST",
          headers: { ...apiTokens, "Content-Type": "application/json" },
          body: JSON.stringify({
            from_date: dateStr,
            to_date: dateStr,
            hub_id: hubId,
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

    // 2. Fetch transactions (COD collections and settlements) from Reconciliation ledger
    let allReconEntries = [];
    const seenIds = new Set();

    try {
      for (let pNo = 1; pNo <= 8; pNo++) {
        const reconPayload = {
          startDate: null,
          endDate: null,
          hubList: [hubId],
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
          // Include COD collections ('cod'/'cash') and settlements ('settlement')
          if (creditType !== 'settlement' && creditType !== 'cod' && creditType !== 'cash') return;

          const created = item.created_at || '';
          let isMatch = false;

          if (typeof created === 'string') {
            if (created.includes(dmySlash) || created.includes(dmyDash) || created.includes(dateStr)) {
              isMatch = true;
            } else if (created.length >= 10) {
              hasOlderDate = true;
            }
          } else if (typeof created === 'number') {
            const d = new Date(created);
            const itemDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (itemDateStr === dateStr) {
              isMatch = true;
            } else {
              hasOlderDate = true;
            }
          }

          if (isMatch) {
            const id = item.id || `${item.reference_number}_${created}_${item.amount}_${creditType}`;
            if (!seenIds.has(id)) {
              seenIds.add(id);
              allReconEntries.push(item);
            }
          }
        });

        if (hasOlderDate && pNo > 2) break;
      }
    } catch (err) {
      console.warn("[ChronoExt] Failed to fetch reconciliation data:", err);
    }

    // 3. Build unified rider list
    const riderMap = {};

    function getCanonicalName(raw) {
      return (raw || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // A. Populate from Trip Manager (official trip reference and status)
    allTrips.forEach(t => {
      const driverName = (t.extra_details?.driver_name || t.worker_name || 'Livreur').trim();
      const tripRef = t.organisation_reference_number || t.trip_reference_number || '';
      const key = getCanonicalName(driverName) || (tripRef ? tripRef.toLowerCase() : 'unknown');

      if (!riderMap[key]) {
        riderMap[key] = {
          name: driverName,
          code: tripRef || '-',
          tripRefs: tripRef ? [tripRef] : [],
          deliveredCount: 0,
          undeliveredCount: 0,
          totalCount: 0,
          status: t.status || 'completed',
          tripCredits: 0,
          collectedAmount: 0,
          settledAmount: 0,
          amount: 0,
          cashier: null,
          parcels: [],
          detailsLoaded: false
        };
      } else {
        if (tripRef && !riderMap[key].tripRefs.includes(tripRef)) {
          riderMap[key].tripRefs.push(tripRef);
          if (!riderMap[key].code || riderMap[key].code === '-' || riderMap[key].code === 'RECON') {
            riderMap[key].code = tripRef;
          }
        }
      }

      riderMap[key].deliveredCount += (t.delivered_task_count || 0);
      riderMap[key].undeliveredCount += (t.attempted_task_count || 0);
      riderMap[key].totalCount += (t.total_task_count || ((t.delivered_task_count || 0) + (t.attempted_task_count || 0)));
      if (t.credits && t.credits > 0) {
        riderMap[key].tripCredits = Math.max(riderMap[key].tripCredits || 0, t.credits);
      }
    });

    // B. Correlate with transactions from reconciliation ledger
    allReconEntries.forEach(item => {
      const riderName = (item.worker_name || 'Inconnu').trim();
      const code = (item.worker_code || '').trim();
      const positiveAmt = Math.abs(parseFloat(item.amount) || 0);
      const creditType = (item.credit_type || '').toLowerCase();
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
          collectedAmount: 0,
          settledAmount: 0,
          amount: 0,
          cashier: null,
          parcels: [],
          detailsLoaded: false
        };
      }

      if (code && (!riderMap[key].code || riderMap[key].code === '-' || riderMap[key].code === 'RECON')) {
        riderMap[key].code = code;
      }

      if (creditType === 'settlement') {
        riderMap[key].settledAmount = (riderMap[key].settledAmount || 0) + positiveAmt;
        if (item.employee_name && !riderMap[key].cashier && item.employee_name !== 'N. A.') {
          riderMap[key].cashier = item.employee_name;
        }
      } else {
        // credit_type === 'cod' or 'cash'
        riderMap[key].collectedAmount = (riderMap[key].collectedAmount || 0) + positiveAmt;
        riderMap[key].parcels.push({
          id: item.id,
          reference_number: item.reference_number,
          amount: positiveAmt,
          created_at: item.created_at,
          employee_name: item.employee_name,
          isDelivered: true
        });
      }
    });

    // C. Finalize amounts and count fallbacks
    Object.values(riderMap).forEach(r => {
      const settled = r.settledAmount || 0;
      const collected = r.collectedAmount || 0;
      const credits = r.tripCredits || 0;

      // Primary settlement amount: settled amount if cashier settled, otherwise collected COD, otherwise trip credits
      r.amount = settled > 0 ? settled : (collected > 0 ? collected : credits);

      // Fallback for counts so it never shows undefined or 0 if COD parcels were delivered
      if ((!r.deliveredCount || r.deliveredCount === 0) && r.parcels.length > 0) {
        r.deliveredCount = r.parcels.length;
      }
      r.count = r.deliveredCount || r.parcels.length || 0;
      r.totalCount = Math.max(r.totalCount || 0, r.count + (r.undeliveredCount || 0));
    });

    return Object.values(riderMap);
  }

  // ── Global Internal Link Interceptor (Prevent blank target tab break) ─
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) {
      const href = link.getAttribute('href') || '';
      if (href.startsWith('/') || href.includes('cross.chronodiali.ma') || href.includes('shipsy.io')) {
        if (link.getAttribute('target') === '_blank') {
          link.removeAttribute('target');
        }
      }
    }
  }, true);

  attachScannerDelegation(document);
  hookScannerButtons(document.body);
  console.log("[ChronoExt] Parcel Status extension loaded ✓");
})();




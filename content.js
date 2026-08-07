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
  const IFRAME_TIMEOUT = 15000;        // ms – max wait for iframe to render
  const IFRAME_POLL = 300;             // ms – how often to poll iframe DOM
  const MAX_CONCURRENT = 3;            // max simultaneous iframe fetches
  const ATTR_PROCESSED = "data-chrono-status-processed";

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

  // ── Iframe-based status fetcher ───────────────────────────

  /**
   * Load the detail page in a hidden iframe, click "Consignment Logs"
   * tab, extract the N most recent timeline entries, then clean up.
   * Returns an array: [{ status, color, time }, …]
   */
  function fetchViaIframe(cnCode) {
    return new Promise((resolve) => {
      if (statusCache.has(cnCode)) {
        resolve(statusCache.get(cnCode));
        return;
      }

      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:fixed;top:-9999px;left:-9999px;width:1200px;height:800px;opacity:0;pointer-events:none;border:none;";
      iframe.src = BASE_URL + encodeURIComponent(cnCode);
      document.body.appendChild(iframe);

      let resolved = false;
      let pollTimer = null;
      let tabClicked = false;

      function finish(result) {
        if (resolved) return;
        resolved = true;
        clearInterval(pollTimer);
        clearTimeout(timeout);
        statusCache.set(cnCode, result);
        setTimeout(() => {
          try { iframe.remove(); } catch (_) {}
        }, 300);
        resolve(result);
      }

      const timeout = setTimeout(() => {
        console.warn(`[ChronoExt] Timeout fetching status for ${cnCode}`);
        finish([{ status: "Timeout", color: "#f59e0b", time: "" }]);
      }, IFRAME_TIMEOUT);

      iframe.addEventListener("load", () => {
        pollTimer = setInterval(() => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!iframeDoc) return;

            // Step 1: Click the "Consignment Logs" tab if not done yet
            if (!tabClicked) {
              const tabs = iframeDoc.querySelectorAll('[role="tab"]');
              for (const tab of tabs) {
                if (tab.textContent.trim() === "Consignment Logs") {
                  tab.click();
                  tabClicked = true;
                  break;
                }
              }
              // If tab not found yet, wait
              if (!tabClicked) return;
              // Give React a moment to render the tab content
              return;
            }

            // Step 2: Extract timeline entries from Consignment Logs
            const timelineItems = iframeDoc.querySelectorAll(
              '.ant-timeline-item'
            );

            if (timelineItems.length === 0) return; // not rendered yet

            const entries = [];
            for (let i = 0; i < Math.min(timelineItems.length, LOG_ENTRIES_COUNT); i++) {
              const item = timelineItems[i];

              // Get timestamp
              const timeEl = item.querySelector('[class*="Component-eventTime-"]');
              const time = timeEl ? timeEl.textContent.trim() : "";

              // Get status text from the collapse content
              // The status is in the last <p> inside Component-timelineEvent-
              const eventEl = item.querySelector('[class*="Component-timelineEvent-"]');
              let status = "";
              if (eventEl) {
                const paragraphs = eventEl.querySelectorAll('p');
                // First p = header (e.g. "Consignment Status"), last = value
                if (paragraphs.length >= 2) {
                  status = paragraphs[paragraphs.length - 1].textContent.trim();
                } else if (paragraphs.length === 1) {
                  status = paragraphs[0].textContent.trim();
                }
              }

              if (!status) {
                // Fallback: try getting any text from the content area
                const contentEl = item.querySelector('.ant-timeline-item-content');
                if (contentEl) status = contentEl.textContent.trim().substring(0, 50);
              }

              // Get dot color from the timeline head
              const headEl = item.querySelector('.ant-timeline-item-head');
              let color = "#22d3ee"; // default cyan
              if (headEl) {
                // color might be in style or in class name
                const bc = headEl.style.borderColor;
                if (bc) color = bc;
                // Also check the class for color hint
                const cls = headEl.className || "";
                const colorMatch = cls.match(/head-(#[0-9a-fA-F]+)/);
                if (colorMatch) color = colorMatch[1];
              }

              if (status) {
                entries.push({ status, color, time });
              }
            }

            if (entries.length > 0) {
              finish(entries);
            }
            // else keep polling — content might still be loading

          } catch (err) {
            console.warn(`[ChronoExt] Iframe access error for ${cnCode}:`, err);
            finish([{ status: "Error", color: "#ef4444", time: "" }]);
          }
        }, IFRAME_POLL);
      });

      iframe.addEventListener("error", () => {
        finish([{ status: "Error", color: "#ef4444", time: "" }]);
      });
    });
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
      statusEl.textContent = entry.status;
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

  function ensureStatusHeader(modal) {
    const headerRow = modal.querySelector(".ant-table-thead tr");
    if (!headerRow) return;

    let th = headerRow.querySelector(".chrono-ext-status-header");
    if (!th) {
      th = document.createElement("th");
      th.className = "ant-table-cell chrono-ext-status-header";
      th.style.width = "650px";
      th.innerHTML = `
        <div style="width:100%;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">
          Status (Last ${LOG_ENTRIES_COUNT})
        </div>
      `;
    }

    // Find Action column header among native cells
    const ths = Array.from(
      headerRow.querySelectorAll("th.ant-table-cell:not(.chrono-ext-status-header)")
    );
    let actionTh = null;
    for (const item of ths) {
      if (item.textContent.trim().toLowerCase().includes("action")) {
        actionTh = item;
        break;
      }
    }

    // Ensure status header th is placed right before actionTh
    if (actionTh) {
      if (th.nextElementSibling !== actionTh) {
        headerRow.insertBefore(th, actionTh);
      }
    } else {
      const scrollbarCell = headerRow.querySelector("th.ant-table-cell-scrollbar");
      if (scrollbarCell && th.nextElementSibling !== scrollbarCell) {
        headerRow.insertBefore(th, scrollbarCell);
      } else if (!scrollbarCell && headerRow.lastElementChild !== th) {
        headerRow.appendChild(th);
      }
    }

    // Explicitly adjust widths of th elements in order
    const allThs = headerRow.querySelectorAll(
      "th.ant-table-cell:not(.ant-table-cell-scrollbar)"
    );
    if (allThs.length >= 4) {
      allThs[0].style.width = "80px";   // S.No.
      allThs[1].style.width = "220px";  // CN No.
      // allThs[2] is Status (650px)
      allThs[3].style.width = "100px";  // Action
    }

    // Colgroup for header table
    const headerCG = modal.querySelector(".ant-table-header table colgroup");
    if (headerCG && headerCG.children.length !== 5) {
      headerCG.innerHTML = `
        <col style="width: 80px;">
        <col style="width: 220px;">
        <col style="width: 650px;">
        <col style="width: 100px;">
        <col style="width: 15px;">
      `;
    }

    // Colgroup for body table
    const bodyCG = modal.querySelector(".ant-table-body table colgroup");
    if (bodyCG && bodyCG.children.length !== 4) {
      bodyCG.innerHTML = `
        <col style="width: 80px;">
        <col style="width: 220px;">
        <col style="width: 650px;">
        <col style="width: 100px;">
      `;
    }
  }

  // ── Row processing ────────────────────────────────────────

  function processTableRows(modal) {
    const tbody = modal.querySelector(".ant-table-tbody");
    if (!tbody) return;

    for (const row of tbody.querySelectorAll("tr")) {
      // Handle measure row
      if (row.classList.contains("ant-table-measure-row")) {
        const tds = row.querySelectorAll("td");
        if (tds.length === 3) {
          const td = document.createElement("td");
          td.style.cssText = "padding:0;border:0;height:0;";
          td.innerHTML = '<div style="height:0;overflow:hidden;">&nbsp;</div>';
          row.insertBefore(td, tds[2]);
        }
        continue;
      }

      // Handle placeholder row
      if (row.classList.contains("ant-table-placeholder")) {
        const td = row.querySelector("td");
        if (td && td.getAttribute("colspan") !== "4") {
          td.setAttribute("colspan", "4");
        }
        continue;
      }

      // Get native cells excluding our injected status cell
      let statusTd = row.querySelector(".chrono-ext-status-cell");
      const otherCells = Array.from(
        row.querySelectorAll("td.ant-table-cell:not(.chrono-ext-status-cell)")
      );

      if (otherCells.length < 2) continue;

      const cnCode = otherCells[1]?.textContent?.trim();
      if (!cnCode) continue;

      // Identify Action cell (cell index 2)
      const actionTd = otherCells.length >= 3 ? otherCells[2] : null;

      // Create status cell if not existing
      const isNew = !statusTd;
      if (isNew) {
        statusTd = document.createElement("td");
        statusTd.className = "ant-table-cell chrono-ext-status-cell";
        statusTd.appendChild(createLoadingBadge());
      }

      // Ensure statusTd is always positioned right before actionTd
      if (actionTd) {
        if (statusTd.nextElementSibling !== actionTd) {
          row.insertBefore(statusTd, actionTd);
        }
      } else {
        if (row.lastElementChild !== statusTd) {
          row.appendChild(statusTd);
        }
      }

      // Fetch and update status if new or unprocessed
      if (isNew || !row.hasAttribute(ATTR_PROCESSED)) {
        row.setAttribute(ATTR_PROCESSED, "true");
        fetchParcelStatus(cnCode).then((entries) => {
          statusTd.innerHTML = "";
          statusTd.appendChild(createStatusTimeline(entries));
        });
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
  
  function openInscanModal() {
    const overlay = document.createElement('div');
    overlay.className = 'chrono-iframe-overlay';
    overlay.innerHTML = `
      <div class="chrono-iframe-loading">Loading Scanner...</div>
      <iframe id="chrono-inscan-iframe" src="/ops/consignments"></iframe>
    `;
    document.body.appendChild(overlay);

    const iframe = overlay.querySelector('#chrono-inscan-iframe');
    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument;
        
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
        let step = 0; // 0 = find main button, 1 = find "Selected" dropdown item, 2 = wait for modal
        
        const checkInterval = setInterval(() => {
          attempts++;
          
          // If the modal has finally appeared, we are done!
          const modal = doc.querySelector('.ant-modal-content');
          if (modal) {
            clearInterval(checkInterval);
            overlay.querySelector('.chrono-iframe-loading').style.display = 'none';
            iframe.style.opacity = '1';
            
            // Apply UI updates to the modal immediately
            tick(doc);
            
            // Watch for the modal to be closed by the user so we can remove the iframe
            // Also call tick() on changes so newly scanned parcels get the status column!
            const closeObserver = new MutationObserver(() => {
              tick(doc);
              if (!doc.querySelector('.ant-modal-content')) {
                overlay.remove();
                closeObserver.disconnect();
              }
            });
            closeObserver.observe(doc.body, { childList: true, subtree: true });
            
            return;
          }

          if (step === 0) {
            // Find "Inscan at Hub" button
            const buttons = Array.from(doc.querySelectorAll('button, .ant-btn, [role="button"]'));
            const inscanBtn = buttons.find(b => {
              const text = b.textContent.toLowerCase();
              return (text.includes('inscan') || text.includes('in scan')) && !b.closest('.ant-modal');
            });
            
            if (inscanBtn) {
              // Hover and click to open dropdown
              inscanBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
              inscanBtn.click();
              step = 1;
            }
          } else if (step === 1) {
            // Find "Selected" in the dropdown menu
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
              // If dropdown didn't appear or closed, try clicking main button again
              step = 0;
            }
          }
          
          if (attempts > 30) { 
            // Give up after 15 seconds. Fallback: remove the hiding CSS and just show the raw page so the user can click it.
            clearInterval(checkInterval);
            style.remove(); // Unhide the layout
            overlay.querySelector('.chrono-iframe-loading').style.display = 'none';
            iframe.style.opacity = '1';
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
    
    // Look for the "Reconcile" button or the container of those buttons
    const buttons = Array.from(document.querySelectorAll('button'));
    const reconcileBtn = buttons.find(b => b.textContent.trim() === 'Reconcile');
    const cancelBtn = buttons.find(b => b.textContent.trim() === 'Cancel');
    const reloadBtn = buttons.find(b => b.querySelector('.anticon-reload'));
    
    // Attach listener to reload button so the toast can show again on soft refresh
    if (reloadBtn && !reloadBtn.dataset.chronoToastAttached) {
      reloadBtn.dataset.chronoToastAttached = 'true';
      reloadBtn.addEventListener('click', () => {
        toastShownForUrl = null; // Reset the toast blocker
      });
    }
    
    if (reconcileBtn && !document.querySelector('.chrono-inscan-ext-btn')) {
      const container = reconcileBtn.parentElement;
      const inscanBtn = document.createElement('button');
      
      // Copy classes from the "Cancel" button to perfectly match design
      if (cancelBtn) {
        inscanBtn.className = cancelBtn.className;
        inscanBtn.classList.add('chrono-inscan-ext-btn');
      } else {
        // Fallback styling if Cancel button is missing for some reason
        inscanBtn.className = "ant-btn chrono-inscan-ext-btn";
        inscanBtn.style.color = "#1890ff";
        inscanBtn.style.borderColor = "#1890ff";
        inscanBtn.style.background = "#f0f7ff";
      }
      
      inscanBtn.style.marginRight = "8px";
      inscanBtn.innerHTML = `<span>Inscan at Hub</span>`;
      
      // Insert right before Cancel/Reconcile
      container.insertBefore(inscanBtn, reconcileBtn.previousElementSibling || reconcileBtn);
      
      inscanBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openInscanModal();
      });
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
    ensureStatusHeader(modal);
    processTableRows(modal);
  }

  // Watch for modal open/close on body
  const bodyObserver = new MutationObserver(() => {
    checkReconciliationToast();
    ensureInscanButton();
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

  console.log("[ChronoExt] Parcel Status extension loaded ✓");
})();

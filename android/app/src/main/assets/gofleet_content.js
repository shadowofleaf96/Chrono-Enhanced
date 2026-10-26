// --- Chrome Extension Runtime & Storage Polyfill for Android WebView ---
(function initChromePolyfill() {
  if (typeof window.chrome === "undefined") {
    window.chrome = {};
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      id: "gofleet-android-extension",
      _listeners: [],
      onMessage: {
        _listeners: [],
        addListener: function (fn) {
          if (typeof fn === "function" && this._listeners.indexOf(fn) === -1) {
            this._listeners.push(fn);
          }
        },
        removeListener: function (fn) {
          var idx = this._listeners.indexOf(fn);
          if (idx !== -1) this._listeners.splice(idx, 1);
        },
        hasListener: function (fn) {
          return this._listeners.indexOf(fn) !== -1;
        },
      },
      sendMessage: function (msg, cb) {
        console.log("[GoFleet-Polyfill] chrome.runtime.sendMessage:", msg);
        if (typeof cb === "function") {
          setTimeout(function () {
            cb({ success: true });
          }, 10);
        }
      },
    };
  }
  if (!window.chrome.storage) {
    window.chrome.storage = {
      local: {
        get: function (keys, cb) {
          var result = {};
          try {
            if (typeof keys === "string") {
              var v = localStorage.getItem("gofleet_" + keys);
              if (v !== null) {
                try { result[keys] = JSON.parse(v); } catch (e) { result[keys] = v; }
              }
            } else if (Array.isArray(keys)) {
              keys.forEach(function (k) {
                var v = localStorage.getItem("gofleet_" + k);
                if (v !== null) {
                  try { result[k] = JSON.parse(v); } catch (e) { result[k] = v; }
                }
              });
            } else if (typeof keys === "object" && keys !== null) {
              result = Object.assign({}, keys);
              Object.keys(keys).forEach(function (k) {
                var v = localStorage.getItem("gofleet_" + k);
                if (v !== null) {
                  try { result[k] = JSON.parse(v); } catch (e) { result[k] = v; }
                }
              });
            }
          } catch (err) {
            console.warn("[GoFleet-Polyfill] storage.local.get error:", err);
          }
          if (typeof cb === "function") {
            setTimeout(function () {
              cb(result);
            }, 5);
          }
        },
        set: function (items, cb) {
          try {
            if (typeof items === "object" && items !== null) {
              Object.keys(items).forEach(function (k) {
                localStorage.setItem("gofleet_" + k, JSON.stringify(items[k]));
              });
            }
          } catch (err) {
            console.warn("[GoFleet-Polyfill] storage.local.set error:", err);
          }
          if (typeof cb === "function") {
            setTimeout(function () {
              cb();
            }, 5);
          }
        },
        remove: function (keys, cb) {
          try {
            var arr = Array.isArray(keys) ? keys : [keys];
            arr.forEach(function (k) {
              localStorage.removeItem("gofleet_" + k);
            });
          } catch (err) {}
          if (typeof cb === "function") setTimeout(cb, 5);
        },
        clear: function (cb) {
          try {
            Object.keys(localStorage).forEach(function (k) {
              if (k.startsWith("gofleet_")) localStorage.removeItem(k);
            });
          } catch (err) {}
          if (typeof cb === "function") setTimeout(cb, 5);
        },
      },
    };
  }
})();

var notificationCooldown = false;
var lastCopyTime = 0;
var lastNotificationMessage = null;
var lastClickTime = 0;
var clickCount = 0;

var barcodeInput = document.getElementById("js-barcode-input");
if (barcodeInput) {
  // State variables
  let allowBlur = false;
  let selectionActive = false;
  let lastSelection = "";
  let isAutoFocusing = false;

  // Toast system variables
  let toastHideTimeout = null;
  let currentToast = null;
  let toastQueue = [];
  let isToastActive = false;

  // Initialize focus
  setTimeout(() => {
    isAutoFocusing = true;
    barcodeInput.focus();
    isAutoFocusing = false;
  }, 100);

  // Track selection
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (selectedText.length > 0) {
      selectionActive = true;
      lastSelection = selectedText;
    } else {
      selectionActive = false;
    }
  });

  document.addEventListener("click", (e) => {
    clickCount++;

    if (clickCount === 1) {
      clickTimeout = setTimeout(() => {
        // Single click behavior (just selection)
        clickCount = 0;
      }, 300); // Double-click detection window
    } else if (clickCount === 2) {
      // Double click behavior (copy operation)
      clearTimeout(clickTimeout);
      clickCount = 0;

      if (selectionActive && lastSelection) {
        handleCopyOperation();
      }
    }
  });

  // Focus management
  barcodeInput.addEventListener("blur", () => {
    if (!allowBlur && !isAutoFocusing) {
      isAutoFocusing = true;
      setTimeout(() => {
        if (!selectionActive) barcodeInput.focus();
        isAutoFocusing = false;
      }, 50);
    }
  });

  function handleCopyOperation() {
    if (selectionActive && lastSelection && !isAutoFocusing) {
      navigator.clipboard
        .writeText(lastSelection)
        .then(() => {
          showToast("Copié !", { type: "success", duration: 800 });
          selectionActive = false;
          setTimeout(() => {
            isAutoFocusing = true;
            barcodeInput.focus();
            isAutoFocusing = false;
          }, 200);
        })
        .catch((err) => {
          console.error("Copy failed:", err);
          showToast("Échec de la copie", { type: "error", duration: 1500 });
        });
    }
  }

  // Click-outside handler
  document.addEventListener("mousedown", (e) => {
    if (!barcodeInput.contains(e.target)) {
      allowBlur = true;
      setTimeout(() => {
        allowBlur = false;
        if (!selectionActive) barcodeInput.focus();
      }, 1000);
    }
  });

  barcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      lastNotificationMessage = null;

      setTimeout(() => {
        checkForNotification();
      }, 500);
    }
  });

  // Modal system for messages with 80% black transparent background and OK button
  function showExpeditionModal(message) {
    // If modal already exists, remove it
    const existingModal = document.getElementById("custom-modal-overlay");
    if (existingModal) existingModal.remove();

    // Create overlay
    const overlay = document.createElement("div");
    overlay.id = "custom-modal-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      backgroundColor: "rgba(0, 0, 0, 0.8)", // 80% black transparent
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 11000,
    });

    // Create modal box
    const modalBox = document.createElement("div");
    Object.assign(modalBox.style, {
      backgroundColor: "#fff",
      borderRadius: "8px",
      padding: "24px 32px",
      maxWidth: "400px",
      width: "90%",
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
      textAlign: "center",
      fontFamily: "Inter, sans-serif",
    });

    // Message text
    const messageEl = document.createElement("p");
    messageEl.textContent = message;
    messageEl.style.marginBottom = "24px";
    messageEl.style.fontSize = "16px";
    messageEl.style.color = "#222";

    // OK button
    const okBtn = document.createElement("button");
    okBtn.textContent = "OK";
    Object.assign(okBtn.style, {
      backgroundColor: "#4CAF50",
      color: "#fff",
      border: "none",
      padding: "10px 20px",
      borderRadius: "5px",
      fontSize: "16px",
      cursor: "pointer",
    });

    okBtn.addEventListener("click", () => {
      overlay.remove();
    });

    // Assemble modal
    modalBox.appendChild(messageEl);
    modalBox.appendChild(okBtn);
    overlay.appendChild(modalBox);

    document.body.appendChild(overlay);
  }

  function waitForSpinnerThenShowModal(message) {
    const spinner = document.querySelector(".fullscreen-loading-spinner");
    if (!spinner) {
      if (
        window.location.href.startsWith(
          "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
        )
      ) {
        // No spinner found, just show modal immediately
        showExpeditionModal(message);
        return;
      }
    }

    function checkSpinner() {
      const style = getComputedStyle(spinner);
      if (style.display === "none") {
        // Spinner is hidden, show modal now
        if (
          window.location.href.startsWith(
            "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
          )
        ) {
          showExpeditionModal(message);
        }
      } else {
        // Spinner still visible, check again after 100ms
        setTimeout(checkSpinner, 100);
      }
    }

    checkSpinner();
  }

  // ✅ Get all current colis from DOM
  function getVisibleColisCodes() {
    return Array.from(
      document.querySelectorAll(
        ".js-colis-details-row .card-header div.text-right"
      )
    )
      .map((el) => {
        const match = el.textContent.match(/Colis\s*N°\s*(\w+)/i);
        return match ? match[1] : null;
      })
      .filter(Boolean);
  }

  // ✅ Save all visible colis into chrome.storage.local
  function saveVisibleColisToStorage() {
    const codes = getVisibleColisCodes();
    chrome.storage.local.set({ scannedColisCodes: codes }, () => {
      console.log("✅ Visible colis codes saved to extension storage:", codes);
    });
  }

  // ✅ Add one colis code to storage
  function addColisToStorage(code) {
    chrome.storage.local.get(["scannedColisCodes"], (result) => {
      const scanned = result.scannedColisCodes || [];
      if (!scanned.includes(code)) {
        scanned.push(code);
        chrome.storage.local.set({ scannedColisCodes: scanned }, () => {
          if (
            window.location.href.startsWith(
              "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
            )
          ) {
            showExpeditionModal("✅ Colis ajouté avec succès.");
          }
        });
      } else {
        if (
          window.location.href.startsWith(
            "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
          )
        ) {
          showExpeditionModal("⚠️ Ce colis a déjà été scanné.");
        }
      }
    });
  }

  // ✅ Handler on scan
  barcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const value = barcodeInput.value.trim().toUpperCase();
      if (!value) return;

      try {
        const spinner = document.querySelector(".fullscreen-loading-spinner");
        if (spinner) {
          spinner.style.display = "flex";
        }
      } catch (err) {
        console.warn("Spinner access failed: ", err.message);
      }

      setTimeout(() => {
        // Hide spinner
        document.querySelector(".fullscreen-loading-spinner").style.display =
          "none";

        const currentCodes = getVisibleColisCodes();
        const isInDOM = currentCodes.includes(value);

        chrome.storage.local.get(["scannedColisCodes"], (result) => {
          const scanned = result.scannedColisCodes || [];

          if (isInDOM && !scanned.includes(value)) {
            scanned.push(value);
            chrome.storage.local.set({ scannedColisCodes: scanned }, () => {
              if (
                window.location.href.startsWith(
                  "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
                )
              ) {
                showExpeditionModal("✅ Colis ajouté avec succès.");
              }
            });
          } else if (isInDOM && scanned.includes(value)) {
            if (
              window.location.href.startsWith(
                "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
              )
            ) {
              showExpeditionModal("⚠️ Ce colis a déjà été scanné.");
            }
          } else {
            if (
              window.location.href.startsWith(
                "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
              )
            ) {
              showExpeditionModal(
                "❌ Le numéro de suivi du colis est invalide."
              );
            }
          }
        });
      }, 500);
    }
  });

  function parseDateTime(dateStr) {
    const [datePart, timePart] = dateStr.split(" à ");
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute);
  }

  // Debounce function to limit rapid calls
  function debounce(func, wait) {
    let timeout;
    return function () {
      const context = this,
        args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }

  function addStatusIcons() {
    const historiqueEl = document.getElementById("historique-content");
    if (!historiqueEl) return;

    const timelineItems = Array.from(document.querySelectorAll(".timeline li"));
    const deliveryAttempts = [];
    let currentAttempt = null;

    // Group statuses by delivery attempt
    timelineItems.forEach((item) => {
      const text = item.textContent;

      // Start new attempt on "Pris en charge livreur"
      if (text.includes("Pris en charge livreur")) {
        currentAttempt = {
          prisEnChargeItem: item,
          prisEnChargeDate: null,
          injoignableItems: [],
        };
        deliveryAttempts.push(currentAttempt);

        // Get date for the delivery attempt
        const dateEl = item.querySelector(".dateh-timeline");
        if (dateEl) {
          const dateText = dateEl.textContent.trim();
          try {
            currentAttempt.prisEnChargeDate = parseDateTime(dateText);
          } catch (e) {
            console.error("Error parsing date:", dateText, e);
          }
        }
      }

      // Add to current attempt on "Injoignable"
      if (text.includes("Injoignable") && currentAttempt) {
        const dateEl = item.querySelector(".dateh-timeline");
        if (dateEl) {
          const dateText = dateEl.textContent.trim();
          try {
            const date = parseDateTime(dateText);
            currentAttempt.injoignableItems.push({ el: item, date });
          } catch (e) {
            console.error("Error parsing date:", dateText, e);
          }
        }
      }
    });

    // Process each delivery attempt
    deliveryAttempts.forEach((attempt) => {
      const injoignableItems = attempt.injoignableItems;
      if (injoignableItems.length < 2) return;

      // Clear existing icons
      injoignableItems.forEach((item) => {
        const badge = item.el.querySelector(".statut-colis-88");
        if (badge) {
          const existingIcons = badge.querySelectorAll(".status-icon");
          existingIcons.forEach((icon) => icon.remove());
        }
      });

      // Check all injoignable statuses beyond the first one
      for (let i = 1; i < injoignableItems.length; i++) {
        const current = injoignableItems[i];
        const previous = injoignableItems[i - 1];
        const timeDiff = (current.date - previous.date) / 60000;

        // Determine required threshold: 45 min for second status, 90 min for others
        const requiredThreshold = i === 1 ? 90 : 90;
        const icon = timeDiff >= requiredThreshold ? "✅" : "❌";
        const statusType = i === 1 ? "second" : "subsequent";

        // Add icon to current status
        const badge = current.el.querySelector(".statut-colis-88");
        if (badge) {
          const iconSpan = document.createElement("span");
          iconSpan.className = `status-icon ${statusType}`;
          iconSpan.style.cssText =
            "display:inline-block;margin-right:8px;font-size:1.2em";
          iconSpan.textContent = icon;
          badge.prepend(iconSpan);
        }
      }
    });
  }

  // Initialize status icon observer
  function initStatusIconObserver() {
    const historiqueEl = document.getElementById("historique-content");

    if (historiqueEl && historiqueEl instanceof Node) {
      // Debounced version of addStatusIcons
      const debouncedAddIcons = debounce(addStatusIcons, 300);

      const observer = new MutationObserver(() => {
        debouncedAddIcons();
      });

      observer.observe(historiqueEl, {
        childList: true,
        subtree: true,
      });

      // Run immediately
      debouncedAddIcons();
    } else {
      // Retry if element doesn't exist yet
      setTimeout(initStatusIconObserver, 500);
    }
  }

  // Start status icon functionality
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStatusIconObserver);
  } else {
    initStatusIconObserver();
  }

  // Improved toast notification system with queue
  function showToast(message, options = {}) {
    // Default options
    const {
      type = "info", // 'info', 'success', 'error', 'warning'
      duration = 2000,
      position = "bottom-right",
    } = options;

    // Add to queue
    toastQueue.push({ message, type, duration, position });

    // If no toast is active, show the next one
    if (!isToastActive) {
      processToastQueue();
    }
  }

  function processToastQueue() {
    if (toastQueue.length === 0) {
      isToastActive = false;
      return;
    }

    isToastActive = true;
    const { message, type, duration, position } = toastQueue.shift();

    // Color mapping
    const colors = {
      info: "#2196F3",
      success: "#4CAF50",
      error: "#F44336",
      warning: "#FFC107",
    };

    // Remove current toast if exists
    if (currentToast) {
      clearTimeout(toastHideTimeout);
      currentToast.remove();
      currentToast = null;
    }

    // Create new toast element
    currentToast = document.createElement("div");

    // Simple notification style for copy feedback
    if (type === "success" && message === "Copié !") {
      currentToast.textContent = message;
      Object.assign(currentToast.style, {
        backgroundColor: colors.success,
        padding: "12px 24px",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
      });
    }
    // Detailed notification style for other messages
    else {
      currentToast.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="${colors[type]}" viewBox="0 0 24 24">
            <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm-.25 5h.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V7.75A.75.75 0 0 1 11.75 7zm.75 10a1.25 1.25 0 1 1 1.25-1.25A1.252 1.252 0 0 1 12.5 17z"/>
          </svg>
          <div style="flex:1;font-weight:500;line-height:1.4;">${message}</div>
        </div>
      `;
      Object.assign(currentToast.style, {
        background: "rgba(33,33,33,0.85)",
        padding: "12px 16px",
        borderRadius: "10px",
        backdropFilter: "blur(5px)",
        maxWidth: "320px",
        wordBreak: "break-word",
      });
    }

    // Common styles
    Object.assign(currentToast.style, {
      position: "fixed",
      color: "#FFF",
      fontFamily: "Inter, sans-serif",
      fontSize: "14px",
      lineHeight: "1.5",
      opacity: "0",
      transition: "opacity 0.3s ease, transform 0.3s ease",
      zIndex: "10000",
      transform: "translateY(20px)",
    });

    // Position styles
    switch (position) {
      case "top-right":
        Object.assign(currentToast.style, { top: "24px", right: "12px" });
        break;
      case "top-left":
        Object.assign(currentToast.style, { top: "24px", left: "12px" });
        break;
      case "bottom-left":
        Object.assign(currentToast.style, { bottom: "24px", left: "12px" });
        break;
      default: // bottom-right
        Object.assign(currentToast.style, { bottom: "24px", right: "12px" });
    }

    document.body.appendChild(currentToast);

    // Animate in
    requestAnimationFrame(() => {
      if (currentToast) {
        currentToast.style.opacity = "1";
        currentToast.style.transform = "translateY(0)";
      }
    });

    // Auto-dismiss after delay
    toastHideTimeout = setTimeout(() => {
      currentToast.style.opacity = "0";
      setTimeout(() => {
        if (currentToast && document.body.contains(currentToast)) {
          currentToast.remove();
          currentToast = null;
        }
        // Process next toast in queue
        processToastQueue();
      }, 300);
    }, duration);
  }
}

(function () {
  if (!document || !document.body || !(document.body instanceof Node)) return;

  function extractAllColisCodesFromHTML() {
    const nodes = document.querySelectorAll(
      ".js-colis-details-row .card-header div.text-right"
    );
    const codes = [];

    nodes.forEach((node) => {
      const match = node.textContent.match(
        /Colis\s*N°\s*((?:GOF|GMK|GFS|GTG|GRB)[0-9A-Z]+|\d{6}[0-9A-Z]{6,})/i
      );
      if (match) {
        codes.push(match[1]);
      }
    });

    return codes;
  }

  function saveColisToExtensionStorage() {
    const allColisCodes = extractAllColisCodesFromHTML();
    chrome.storage.local.set({ scannedColisCodes: allColisCodes }, () => {
      console.log(
        "✅ All existing colis saved to scannedColisCodes:",
        allColisCodes
      );
    });
  }

  function waitForColisAndSave() {
    if (!document.body || !(document.body instanceof Node)) return;
    const observer = new MutationObserver((mutations, obs) => {
      const colisNodes = document.querySelectorAll(".js-colis-details-row");
      if (colisNodes.length > 0) {
        obs.disconnect(); // stop observing
        saveColisToExtensionStorage();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function setupEnterKeyToCloseModal() {
    document.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        const activeModal = document.querySelector(".modal.show"); // or whatever class your modal uses
        if (activeModal) {
          // Option 1: click close button inside modal
          const closeBtn = activeModal.querySelector(".modal-close");
          if (closeBtn) {
            closeBtn.click();
          } else {
            // Option 2: hide modal directly
            activeModal.classList.remove("show");
            activeModal.classList.add("hidden");
          }
        }
      }
    });
  }

  waitForColisAndSave();
  setupEnterKeyToCloseModal();
})();

(function () {
  window.addEventListener("load", () => {
    const path = window.location.pathname.replace(/\/$/, "");

    if (path === "/Hub/TraitementRetour") {
      function showToastWithCopy(colisList) {
        const existingToast = document.getElementById("gof-toast");
        if (existingToast) existingToast.remove();

        const toast = document.createElement("div");
        toast.id = "gof-toast";
        Object.assign(toast.style, {
          position: "fixed",
          bottom: "20px",
          right: "20px",
          background: "#2c3e50",
          color: "#ecf0f1",
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          padding: "16px",
          borderRadius: "10px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          zIndex: "10000",
          maxWidth: "300px",
          opacity: "0",
          transition: "opacity 0.3s ease",
        });

        toast.innerHTML = `
          <div style="margin-bottom: 10px;">
            <strong style="font-size: 16px; color: #1abc9c;">${colisList.length}</strong> colis <span style="opacity: 0.8;">"Assigné livreur"</span>
          </div>
          <div style="display: flex; gap: 10px;">
            <button id="gof-copy-colis" style="flex:1; padding:8px 10px; background:#3498db; color:white; border:none; border-radius:6px; cursor:pointer; transition: background 0.3s;">Copier</button>
            <button id="gof-dismiss-toast" style="flex:1; padding:8px 10px; background:#7f8c8d; color:white; border:none; border-radius:6px; cursor:pointer; transition: background 0.3s;">Fermer</button>
          </div>
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
          toast.style.opacity = "1";
        }, 10);

        document
          .getElementById("gof-copy-colis")
          .addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(colisList.join("\n"));
              const copyBtn = document.getElementById("gof-copy-colis");
              copyBtn.textContent = "Copié !";
              copyBtn.style.background = "#27ae60";
              setTimeout(() => {
                copyBtn.textContent = "Copier";
                copyBtn.style.background = "#3498db";
              }, 2000);
            } catch (err) {
              console.error("Clipboard error:", err);
              alert("Erreur lors de la copie");
            }
          });

        document
          .getElementById("gof-dismiss-toast")
          .addEventListener("click", () => {
            toast.remove();
          });
      }

      function showEmptyToast() {
        const existingToast = document.getElementById("gof-toast");
        if (existingToast) existingToast.remove();

        const toast = document.createElement("div");
        toast.id = "gof-toast";
        Object.assign(toast.style, {
          position: "fixed",
          bottom: "20px",
          right: "20px",
          background: "#2c3e50",
          color: "#ecf0f1",
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          padding: "16px",
          borderRadius: "10px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          zIndex: "10000",
          maxWidth: "300px",
          opacity: "0",
          transition: "opacity 0.3s ease",
          textAlign: "center",
        });

        toast.innerHTML = `
          <div style="margin-bottom: 10px; font-size: 16px;">
            Aucun retour <span style="opacity: 0.8;">"Assigné livreur"</span> trouvé
          </div>
          <button id="gof-dismiss-toast" style="padding:8px 10px; background:#7f8c8d; color:white; border:none; border-radius:6px; cursor:pointer; transition: background 0.3s;">Fermer</button>
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
          toast.style.opacity = "1";
        }, 10);

        document
          .getElementById("gof-dismiss-toast")
          .addEventListener("click", () => {
            toast.remove();
          });
      }

      function checkAssignedLivreurAndNotifyOnce() {
        try {
          const table = document.querySelector("table.table");
          if (!table) return;

          const rows = table.querySelectorAll("tbody tr");
          const assignedColis = [];

          rows.forEach((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 6) return;

            const statusCell = cells[5];
            const statusText = (
              statusCell.querySelector(".badge, p, span, div") || statusCell
            ).textContent
              .trim()
              .toLowerCase();

            if (statusText.includes("assigné livreur")) {
              const colisNumber = cells[0].textContent.trim();
              assignedColis.push(colisNumber);
            }
          });

          if (assignedColis.length > 0) {
            showToastWithCopy(assignedColis);
          } else {
            showEmptyToast();
          }
        } catch (e) {
          console.error("[GOF] Error in notification logic", e);
        }
      }

      checkAssignedLivreurAndNotifyOnce();
    } else {
      console.log("Not on /Hub/TraitementRetour page, script skipped.");
    }
  });
})();

// Notification check logic
function checkForNotification() {
  if (notificationCooldown) return;

  const tourneeStates = document.querySelectorAll(".tournee-state");
  let assignCount = 0;
  let refusedFound = false;

  for (const state of tourneeStates) {
    const stateText = state.textContent.trim().toLowerCase();

    if (stateText === "refusé") {
      refusedFound = true;
      break;
    }

    if (!refusedFound && stateText === "assigné livreur") {
      assignCount++;
      if (assignCount >= 3) break;
    }
  }

  const reasonElements = document.querySelectorAll(".text-red.txt-zone-l99");
  let cancellationReason = "Raison non spécifiée";

  for (const el of reasonElements) {
    if (el.textContent.includes("Motif:")) {
      cancellationReason = el.textContent.replace("Motif:", "").trim();
      break;
    }
  }

  let currentMessage = null;

  if (refusedFound) {
    currentMessage = "Attention : Ce colis a été annulé: " + cancellationReason;
  } else if (assignCount === 2) {
    currentMessage =
      "Attention : 2 fois « Assignée Livreur » – veuillez procéder au cachet du colis « 3 tentatives »";
  } else if (assignCount >= 3) {
    currentMessage = `Attention : Assignée Livreur ${assignCount} fois – veuillez procéder à annuler ce colis`;
  }

  // Only show if it's a new message
  if (currentMessage && currentMessage !== lastNotificationMessage) {
    showToast(currentMessage, {
      type: refusedFound ? "error" : assignCount >= 3 ? "error" : "warning",
      duration: 2000,
    });
    lastNotificationMessage = currentMessage;
    notificationCooldown = true;
    setTimeout(() => (notificationCooldown = false), 2000);
  }
}

// Debounce and observe changes
var debouncedCheck = debounce(checkForNotification, 500);
var observer = null;
if (
  document.body &&
  document.body instanceof Node &&
  (window.location.pathname.includes("/Hub/TraitementRetour") ||
    document.querySelector(".tournee-state") ||
    document.getElementById("js-barcode-input"))
) {
  observer = new MutationObserver(debouncedCheck);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  });
}

function debounce(func, wait) {
  let timeout;
  return function () {
    const context = this,
      args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

function detectCurrentCity() {
  const hubText =
    document.querySelector(".user-top-btn .ml-2")?.textContent || "";
  const normalized = hubText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (normalized.includes("FES")) return "fes";
  if (normalized.includes("TANGER")) return "tanger";
  if (normalized.includes("RABAT")) return "rabat";
  if (normalized.includes("MEKNES")) return "meknes";
  return "unknown";
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "detectCity") {
    const city = detectCurrentCity();
    sendResponse({ city });
  }
});

// Add debug logs and improve page detection
function handleExpeditionRequests(request, sender, sendResponse) {
  if (request.action === "collectFullExpeditionData") {
    // Main expedition list page
    if (window.location.pathname.endsWith("/TourneeMM/Expedition")) {
      const expeditions = Array.from(
        document.querySelectorAll(".tournee-card-info")
      ).map((card) => ({
        number: card.querySelector(".tournee-num")?.textContent.trim() || "N/A",
        link: card.href,
        type: card.querySelector(".tournee-type")?.textContent.trim() || "N/A",
        city:
          card.querySelector(".tournee-dist-city")?.textContent.trim() || "N/A",
        status:
          card.querySelector(".tournee-state")?.textContent.trim() || "Unknown",
        pallets:
          card.querySelector(".small.text-dark")?.textContent.trim() || "0",
        timestamp: new Date().toISOString(),
      }));

      sendResponse({ expeditions });
    } else if (
      window.location.pathname.includes(
        "/TourneeMM/Expedition/EditPaletteWithColis"
      )
    ) {
      // Debug container element
      const container = document.getElementById("js-colis-list-info");

      // Initial element check
      const initialElements = document.querySelectorAll(
        ".js-colis-details-row"
      );

      const observer = new MutationObserver((mutations) => {
        const currentElements = document.querySelectorAll(
          ".js-colis-details-row"
        );

        if (currentElements.length > 0) {
          processColisElements(currentElements);
          observer.disconnect();
        }
      });

      const targetContainer = container || document.body;
      if (targetContainer && targetContainer instanceof Node) {
        observer.observe(targetContainer, {
          childList: true,
          subtree: true,
        });
      }

      function processColisElements(elements) {
        const colisList = Array.from(elements).map((colis) => {
          // Debug numcolis extraction
          const numcolisElement = colis.querySelector("[data-numcolis]");
          const numColis = numcolisElement?.dataset.numcolis;

          // Debug text content extraction
          const numberElement = colis.querySelector(".text-green");
          const displayedNumber = numberElement?.textContent
            ?.replace("Colis N°", "")
            ?.trim();

          // Debug zone extraction
          const zoneElement = colis.querySelector(".card-body div");
          const zoneText = zoneElement?.textContent;
          const zone = zoneText?.split("Zone :")[1]?.trim();

          return {
            number: numColis || displayedNumber || "N/A",
            zone: zone || "N/A",
            timestamp: new Date().toISOString(),
          };
        });

        sendResponse({ colisList });
      }

      // Immediate check
      if (initialElements.length > 0) {
        processColisElements(initialElements);
      }

      // Fallback timeout
      setTimeout(() => {
        const finalElements = document.querySelectorAll(
          ".js-colis-details-row"
        );

        if (finalElements.length > 0) {
          processColisElements(finalElements);
        } else {
          console.warn("No colis elements found after timeout");
          sendResponse({ colisList: [] });
        }
        observer.disconnect();
      }, 5000);
    }
    // Expedition detail page
    else if (window.location.pathname.includes("/TourneeMM/Expedition/Edit")) {
      // Tournee Number (with enhanced selector)
      const tourneeInput = document.querySelector(
        'input[type="text"][readonly]:not([placeholder])'
      );
      const tourneeNumber = tourneeInput?.value || "N/A";

      // Plomb Number (hardcoded as per requirement)
      const plombNumber = "1230";

      // Palettes
      const palettes = Array.from(
        document.querySelectorAll(".js-palette-details-row")
      ).map((palette) => ({
        number:
          palette
            .querySelector(".text-green")
            ?.textContent.replace("Palette N°", "")
            .trim() || "N/A",
        link: palette.href,
        colisCount:
          parseInt(
            palette
              .querySelector(".card-body  .p-3")
              ?.textContent.replace("Colis :", "")
              .trim()
          ) || 0,
      }));
      sendResponse({ tourneeNumber, plombNumber, palettes });
    }
  }
}

chrome.runtime.onMessage.addListener(handleExpeditionRequests);

// --- Start Caissier History & Snapshot Module ---
function isConsultationOrTraitementLivreurPage() {
  const path = window.location.pathname.toLowerCase();
  const href = window.location.href.toLowerCase();
  return (
    path.includes("traitement") ||
    href.includes("traitement") ||
    path.includes("consultation") ||
    href.includes("consultation") ||
    path.includes("retour") ||
    href.includes("retour") ||
    document.querySelector(".js-colis-data, .js-colis-details-row, [data-colinum]") !== null
  );
}

function isCaissierPage() {
  const path = window.location.pathname.toLowerCase();
  const href = window.location.href.toLowerCase();
  return (
    (path.includes("/caissier/caissier") || path.includes("/caissier")) &&
    !path.includes("traitement") &&
    !href.includes("traitement") &&
    !path.includes("retour") &&
    !href.includes("retour")
  );
}

function getCaissierDateFilter() {
  const dateInput = document.querySelector(
    "input[name='dateFilter'], input#dateFilter, input[type='date']"
  );
  if (dateInput && dateInput.value) {
    return dateInput.value.trim();
  }
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDeliveryBoyRow(row) {
  const name =
    row.querySelector(".text-dark-75")?.textContent?.trim() ||
    row.getAttribute("data-livreurname")?.trim() ||
    "N/A";

  let livree = 0;
  let nonLivree = 0;
  let retourRecupere = 0;
  let retourNonRecupere = 0;

  // Cibler spécifiquement les éléments span pour ne pas capturer les conteneurs div parents
  const spans = Array.from(row.querySelectorAll("span"));

  for (const span of spans) {
    const text = span.textContent.replace(/\s+/g, " ").trim().toLowerCase();

    // 1. Non Livrés (ex: "Non livrés", "Non Livrées")
    if (text.includes("non") && (text.includes("livré") || text.includes("livree"))) {
      const prev = span.previousElementSibling?.textContent?.match(/\d+/);
      const next = span.nextElementSibling?.textContent?.match(/\d+/);
      const self = span.textContent?.match(/\d+/);
      const parent = span.parentElement?.textContent?.match(/\d+/);
      nonLivree = prev ? parseInt(prev[0], 10) : next ? parseInt(next[0], 10) : self ? parseInt(self[0], 10) : parent ? parseInt(parent[0], 10) : 0;
    }
    // 2. Livrés (en excluant strictement "non")
    else if (!text.includes("non") && (text === "livrés" || text === "livrées" || text === "livré" || text === "livrée" || text.startsWith("livré"))) {
      const prev = span.previousElementSibling?.textContent?.match(/\d+/);
      const next = span.nextElementSibling?.textContent?.match(/\d+/);
      const self = span.textContent?.match(/\d+/);
      const parent = span.parentElement?.textContent?.match(/\d+/);
      livree = prev ? parseInt(prev[0], 10) : next ? parseInt(next[0], 10) : self ? parseInt(self[0], 10) : parent ? parseInt(parent[0], 10) : 0;
    }
    // 3. Non Récupérés (ex: "Non Récupérés")
    else if (text.includes("non") && (text.includes("récupéré") || text.includes("recupere"))) {
      const prev = span.previousElementSibling?.textContent?.match(/\d+/);
      const next = span.nextElementSibling?.textContent?.match(/\d+/);
      const self = span.textContent?.match(/\d+/);
      const parent = span.parentElement?.textContent?.match(/\d+/);
      retourNonRecupere = prev ? parseInt(prev[0], 10) : next ? parseInt(next[0], 10) : self ? parseInt(self[0], 10) : parent ? parseInt(parent[0], 10) : 0;
    }
    // 4. Retours récupérés (en excluant strictement "non")
    else if (!text.includes("non") && (text.includes("récupéré") || text.includes("recupere"))) {
      const prev = span.previousElementSibling?.textContent?.match(/\d+/);
      const next = span.nextElementSibling?.textContent?.match(/\d+/);
      const self = span.textContent?.match(/\d+/);
      const parent = span.parentElement?.textContent?.match(/\d+/);
      retourRecupere = prev ? parseInt(prev[0], 10) : next ? parseInt(next[0], 10) : self ? parseInt(self[0], 10) : parent ? parseInt(parent[0], 10) : 0;
    }
  }

  const totalColis = livree + nonLivree;

  return {
    name,
    totalColis,
    livree,
    nonLivree,
    retourRecupere,
    retourNonRecupere,
    timestamp: new Date().toISOString(),
  };
}

function parseRidersFromDOM() {
  const rows = document.querySelectorAll(
    ".js-tournee-info-container:not(#gofleet-restored-card)"
  );
  const deliveryBoys = [];
  const cardsHtml = [];

  rows.forEach((row) => {
    try {
      const boy = parseDeliveryBoyRow(row);
      deliveryBoys.push(boy);
      cardsHtml.push(row.outerHTML);
    } catch (e) {
      console.warn("Failed to parse row", e);
    }
  });

  return { deliveryBoys, cardsHtml };
}

function renderRiderCardHtml(boy) {
  return `
    <div class="col-xl-4 col-lg-6 col-md-6 col-sm-12 mb-4 js-tournee-info-container" id="gofleet-restored-card">
      <div class="card card-custom card-stretch gutter-b" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #ebedf2; background: #fff;">
        <div class="card-body pt-5 pb-5">
          <div class="d-flex align-items-center mb-3">
            <div class="symbol symbol-40 symbol-light-primary mr-3" style="width: 42px; height: 42px; border-radius: 10px; background: #e1f0ff; display: flex; align-items: center; justify-content: center; font-size: 18px; margin-right: 12px;">
              🛵
            </div>
            <div class="d-flex flex-column flex-grow-1">
              <span class="text-dark-75 font-weight-bolder font-size-h6" style="font-weight: 700; color: #181c32; font-size: 15px;">
                ${boy.name}
              </span>
              <span class="text-muted font-size-sm" style="font-size: 12px; color: #7e8299;">Total colis : <strong style="color: #3f4254;">${boy.totalColis}</strong></span>
            </div>
          </div>
          <div class="separator separator-dashed my-3" style="border-bottom: 1px dashed #ebedf2; margin: 10px 0;"></div>
          <div class="d-flex justify-content-between align-items-center mb-2" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span class="text-muted font-weight-bold" style="color: #7e8299; font-weight: 600;">Livrées :</span>
            <span class="text-success font-weight-bold" style="font-size:25px; color: #1bc5bd !important; font-weight: 700;">${boy.livree}</span>
          </div>
          <div class="d-flex justify-content-between align-items-center mb-2" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span class="text-muted font-weight-bold" style="color: #7e8299; font-weight: 600;">Non Livrées :</span>
            <span class="font-weight-bold" style="font-size:25px; color: #D70073 !important; font-weight: 700;">${boy.nonLivree}</span>
          </div>
          <div class="separator separator-dashed my-2" style="border-bottom: 1px dashed #ebedf2; margin: 8px 0;"></div>
          <div class="d-flex justify-content-between align-items-center font-size-sm" style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
            <span class="font-weight-bold" style="color: #3f4254; font-weight: 600;">Retours récupérés :</span>
            <span class="text-success font-weight-bold" style="font-size:13px; color: #1bc5bd !important; font-weight: 700;">${boy.retourRecupere}</span>
          </div>
          <div class="d-flex justify-content-between align-items-center font-size-sm mt-1" style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-top: 4px;">
            <span class="font-weight-500" style="color: #7e8299;">Non Récupérés :</span>
            <span class="text-danger font-weight-bold" style="font-size:13px; color: #f64e60 !important; font-weight: 700;">${boy.retourNonRecupere}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function downloadQuickExcel(deliveryBoys, dateStr) {
  let table = `<table border="1">
    <tr style="background:#4A6CF7;color:white;font-weight:bold;">
      <th>Livreur</th><th>Total Colis</th><th>Livrées</th><th>Non Livrées</th><th>Retours Récupérés</th><th>Retours Non Récupérés</th>
    </tr>`;
  let tot = 0, liv = 0, nliv = 0, ret = 0, nret = 0;
  deliveryBoys.forEach((d) => {
    tot += Number(d.totalColis) || 0;
    liv += Number(d.livree) || 0;
    nliv += Number(d.nonLivree) || 0;
    ret += Number(d.retourRecupere) || 0;
    nret += Number(d.retourNonRecupere) || 0;
    table += `<tr>
      <td>${d.name}</td><td>${d.totalColis}</td><td>${d.livree}</td><td>${d.nonLivree}</td><td>${d.retourRecupere}</td><td>${d.retourNonRecupere}</td>
    </tr>`;
  });
  table += `<tr style="font-weight:bold;background:#f2f2f2;">
    <td>TOTAL</td><td>${tot}</td><td>${liv}</td><td>${nliv}</td><td>${ret}</td><td>${nret}</td>
  </tr></table>`;

  const blob = new Blob([`\uFEFF${table}`], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `EXPORT_LIVREUR_${dateStr}.xls`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

function findTourneeMountPoint() {
  const existingRows = document.querySelectorAll(
    ".js-tournee-info-container:not(#gofleet-restored-card)"
  );
  if (existingRows.length > 0) {
    return existingRows[0].parentElement;
  }

  let mount = document.getElementById("gofleet-tournee-mount");
  if (mount) return mount;

  // 1. Try to find the filter card/container containing the date input or search input
  const dateInput = document.querySelector(
    "input[name='dateFilter'], input#dateFilter, input[type='date']"
  );
  const searchInput = document.querySelector(
    "input[placeholder*='Cherch'], input[name*='search'], input[type='search']"
  );
  const filterEl = dateInput || searchInput;
  if (filterEl) {
    const filterCard = filterEl.closest(".card, .card-custom, form, .row");
    if (filterCard && filterCard.parentElement) {
      mount = document.createElement("div");
      mount.id = "gofleet-tournee-mount";
      mount.className = "w-100 mt-4";
      filterCard.insertAdjacentElement("afterend", mount);
      return mount;
    }
  }

  // 2. Try form
  const form = document.querySelector(
    "form[action*='/Caissier/Caissier'], form"
  );
  if (form) {
    const card = form.closest(".card") || form;
    if (card && card.parentElement) {
      mount = document.createElement("div");
      mount.id = "gofleet-tournee-mount";
      mount.className = "w-100 mt-4";
      card.insertAdjacentElement("afterend", mount);
      return mount;
    }
  }

  // 3. Main content container (BEFORE footer)
  const footer = document.querySelector("#kt_footer, .footer, footer");
  const mainContent = document.querySelector(
    "#kt_content .container, #kt_content .container-fluid, .content .container, .content, #kt_content"
  );

  mount = document.createElement("div");
  mount.id = "gofleet-tournee-mount";
  mount.className = "w-100 mt-4";

  if (mainContent) {
    mainContent.appendChild(mount);
  } else if (footer && footer.parentElement) {
    footer.parentElement.insertBefore(mount, footer);
  } else {
    document.body.appendChild(mount);
  }
  return mount;
}

function showAutoSaveBadge(count, dateStr) {
  let badge = document.getElementById("gofleet-auto-save-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "gofleet-auto-save-badge";
    badge.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: linear-gradient(135deg, #1bc5bd 0%, #0bb7af 100%);
      color: white;
      padding: 10px 20px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 4px 15px rgba(27, 197, 189, 0.4);
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: opacity 0.5s ease, transform 0.5s ease;
    `;
    document.body.appendChild(badge);
  }
  badge.innerHTML = `✅ GoFleet : <strong>${count} livreur(s)</strong> archivé(s) (${dateStr})`;
  setTimeout(() => {
    if (badge) {
      badge.style.opacity = "0";
      badge.style.transform = "translateY(10px)";
      setTimeout(() => badge.remove(), 500);
    }
  }, 4500);
}

function restoreRidersOnPage(saved) {
  const mount = findTourneeMountPoint();
  if (!mount) return;

  // Scoped styles to enforce 100% full-width cards and clean vertical layout
  const styleId = "gofleet-history-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #gofleet-tournee-mount {
        width: 100% !important;
        margin-top: 15px !important;
        margin-bottom: 30px !important;
        display: block !important;
      }
      #gofleet-history-cards-wrapper {
        display: flex !important;
        flex-direction: column !important;
        gap: 14px !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      #gofleet-history-cards-wrapper .gofleet-history-card-item {
        width: 100% !important;
        max-width: 100% !important;
        display: block !important;
        clear: both !important;
        box-sizing: border-box !important;
      }
      #gofleet-history-cards-wrapper .js-tournee-info-container {
        width: 100% !important;
        max-width: 100% !important;
        display: block !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        margin-bottom: 0 !important;
        box-sizing: border-box !important;
      }
      #gofleet-history-cards-wrapper .js-tournee-info-container > * {
        box-sizing: border-box !important;
      }
    `;
    document.head.appendChild(style);
  }

  document.getElementById("gofleet-history-banner")?.remove();
  document.getElementById("gofleet-history-cards-wrapper")?.remove();
  document.getElementById("gofleet-history-notice")?.remove();

  const banner = document.createElement("div");
  banner.id = "gofleet-history-banner";
  banner.style.cssText = `
    width: 100%;
    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
    color: white;
    padding: 14px 22px;
    border-radius: 12px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 4px 15px rgba(30, 60, 114, 0.25);
    font-family: inherit;
    box-sizing: border-box;
    z-index: 10;
  `;

  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 14px;">
      <span style="font-size: 26px;">📦</span>
      <div>
        <div style="font-weight: 700; font-size: 15px; letter-spacing: 0.3px;">
          Historique GoFleet Enhancer restauré
        </div>
        <div style="font-size: 13px; opacity: 0.9; margin-top: 2px;">
          Date : <strong>${saved.date}</strong> &nbsp;•&nbsp; <strong>${saved.deliveryBoys.length} livreur(s)</strong> sauvegardé(s)
        </div>
      </div>
    </div>
    <button id="gofleet-btn-export-direct" type="button" style="
      background: linear-gradient(135deg, #28a745, #218838);
      color: white;
      border: none;
      padding: 9px 18px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
        <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
      </svg>
      Exporter Excel (${saved.date})
    </button>
  `;

  const cardsWrapper = document.createElement("div");
  cardsWrapper.id = "gofleet-history-cards-wrapper";

  if (saved.cardsHtml && saved.cardsHtml.length > 0) {
    cardsWrapper.innerHTML = saved.cardsHtml
      .map(
        (html) => `<div class="gofleet-history-card-item">${html}</div>`
      )
      .join("");
  } else {
    cardsWrapper.innerHTML = `
      <div class="row w-100 m-0">
        ${saved.deliveryBoys.map((boy) => renderRiderCardHtml(boy)).join("")}
      </div>
    `;
  }

  mount.appendChild(banner);
  mount.appendChild(cardsWrapper);

  chrome.storage.local.set({ deliveryBoys: saved.deliveryBoys });

  const exportBtn = banner.querySelector("#gofleet-btn-export-direct");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      downloadQuickExcel(saved.deliveryBoys, saved.date);
    });
  }
}

function showEmptyHistoryNotice(dateStr) {
  const mount = findTourneeMountPoint();
  if (!mount) return;

  document.getElementById("gofleet-history-banner")?.remove();
  document.getElementById("gofleet-history-cards-wrapper")?.remove();
  document.getElementById("gofleet-history-notice")?.remove();

  const notice = document.createElement("div");
  notice.id = "gofleet-history-notice";
  notice.style.cssText = `
    width: 100%;
    background: #fff8dd;
    color: #b58105;
    border: 1px solid #ffeeba;
    padding: 16px 20px;
    border-radius: 12px;
    margin-top: 15px;
    margin-bottom: 20px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    font-size: 13.5px;
    box-sizing: border-box;
  `;
  notice.innerHTML = `
    <span style="font-size: 24px; line-height: 1;">ℹ️</span>
    <div>
      <div style="font-weight: 700; font-size: 14.5px; margin-bottom: 4px;">
        Aucune donnée archivée pour le ${dateStr}
      </div>
      <div>
        Le serveur TMS n'affiche pas les tournées déjà clôturées pour cette date.<br/>
        GoFleet Enhancer enregistre automatiquement les données chaque jour dès que vous ouvrez la page pendant la tournée.
      </div>
    </div>
  `;
  mount.appendChild(notice);
}

var caissierProcessedDate = null;
function handleCaissierPage() {
  if (!isCaissierPage()) return;

  const dateFilter = getCaissierDateFilter();
  const rows = document.querySelectorAll(
    ".js-tournee-info-container:not(#gofleet-restored-card)"
  );

  if (rows.length > 0) {
    // Live riders on page -> Clean up any restored banner or cards from prior history view
    document.getElementById("gofleet-history-banner")?.remove();
    document.getElementById("gofleet-history-cards-wrapper")?.remove();
    document.getElementById("gofleet-history-notice")?.remove();

    // Auto-archive live riders
    const { deliveryBoys, cardsHtml } = parseRidersFromDOM();
    if (deliveryBoys.length > 0) {
      chrome.storage.local.get({ caissier_history: {} }, (res) => {
        const history = res.caissier_history || {};
        history[dateFilter] = {
          date: dateFilter,
          updatedAt: new Date().toISOString(),
          deliveryBoys,
          cardsHtml,
        };
        chrome.storage.local.set({ caissier_history: history, deliveryBoys }, () => {
          console.log(
            `[GoFleet Enhancer] Sauvegarde automatique : ${deliveryBoys.length} livreurs pour le ${dateFilter}`
          );
          if (caissierProcessedDate !== dateFilter) {
            caissierProcessedDate = dateFilter;
            showAutoSaveBadge(deliveryBoys.length, dateFilter);
          }
        });
      });
    }
  } else {
    // 0 riders returned by server -> Check history for this date!
    chrome.storage.local.get({ caissier_history: {} }, (res) => {
      const history = res.caissier_history || {};
      const saved = history[dateFilter];
      if (saved && saved.deliveryBoys && saved.deliveryBoys.length > 0) {
        console.log(
          `[GoFleet Enhancer] Restauration de ${saved.deliveryBoys.length} livreurs pour le ${dateFilter}`
        );
        restoreRidersOnPage(saved);
      } else {
        showEmptyHistoryNotice(dateFilter);
      }
    });
  }
}

if (isCaissierPage()) {
  setTimeout(handleCaissierPage, 600);
  setTimeout(handleCaissierPage, 1800);
  setTimeout(handleCaissierPage, 3500);

  document.addEventListener("change", (e) => {
    if (
      isCaissierPage() &&
      e.target &&
      (e.target.matches("input[name='dateFilter'], input#dateFilter, input[type='date']") ||
        e.target.closest("input[name='dateFilter'], input#dateFilter, input[type='date']"))
    ) {
      document.getElementById("gofleet-history-banner")?.remove();
      document.getElementById("gofleet-history-cards-wrapper")?.remove();
      document.getElementById("gofleet-history-notice")?.remove();
      setTimeout(handleCaissierPage, 600);
      setTimeout(handleCaissierPage, 1600);
    }
  });

  if (document.body && document.body instanceof Node) {
    var caissierObserver = new MutationObserver(() => {
      if (
        !document.getElementById("gofleet-history-cards-wrapper") &&
        !document.getElementById("gofleet-history-notice")
      ) {
        handleCaissierPage();
      }
    });
    caissierObserver.observe(document.body, { childList: true, subtree: true });
  }
}
// --- End Caissier History & Snapshot Module ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "collectDeliveryBoyData") {
    const rows = document.querySelectorAll(".js-tournee-info-container");
    const deliveryBoys = [];

    rows.forEach((row) => {
      try {
        const boy = parseDeliveryBoyRow(row);
        deliveryBoys.push(boy);
      } catch (e) {
        console.warn("Failed to parse row", e);
      }
    });

    const currentDate = isCaissierPage()
      ? getCaissierDateFilter()
      : new Date().toISOString().split("T")[0];

    if (deliveryBoys.length === 0) {
      // Fallback to history for current selected date
      chrome.storage.local.get({ caissier_history: {} }, (result) => {
        const history = result.caissier_history || {};
        const saved = history[currentDate];
        if (saved && saved.deliveryBoys && saved.deliveryBoys.length > 0) {
          chrome.storage.local.set({ deliveryBoys: saved.deliveryBoys }, () => {
            sendResponse({
              status: "ok",
              deliveryBoys: saved.deliveryBoys,
              date: currentDate,
              fromHistory: true,
            });
          });
        } else {
          console.error("No data found for delivery boys.");
          sendResponse({
            status: "error",
            message: `Aucune donnée trouvée pour le ${currentDate}.`,
          });
        }
      });
      return true; // Keep channel open for async response
    } else {
      chrome.storage.local.set({ deliveryBoys }, () => {
        console.log("Delivery data saved:", deliveryBoys);
        sendResponse({ status: "ok", deliveryBoys, date: currentDate });
      });
    }

    return true;
  }
});

function extractRefusedColis() {
  // Get today's date in DD/MM/YYYY format
  const today = new Date();
  const formattedDate = `${String(today.getDate()).padStart(2, "0")}/${String(
    today.getMonth() + 1
  ).padStart(2, "0")}/${today.getFullYear()}`;

  // Extract livreur name
  const livreurElement = document.querySelector(".caissier-style label.ml-3");
  const livreur = livreurElement
    ? livreurElement.textContent.trim()
    : "Unknown";

  // First get existing data to check for duplicates
  chrome.storage.local.get({ refusedColis: [] }, function (result) {
    const existingColis = result.refusedColis;
    const existingColisNumbers = new Set(
      existingColis.map((item) => item.colis)
    );

    // Extract refused colis data
    const newRefusedColis = [];

    document.querySelectorAll(".js-colis-data").forEach((card) => {
      const status = card.querySelector(".js-statut-info");
      if (status && status.textContent.includes("Refusé")) {
        // Extract colis number
        const colisElement = card.querySelector("h6.style-87");
        const colisNumber = colisElement
          ? colisElement.textContent.replace("Colis N°", "").trim()
          : "Unknown";

        // Only add if this colis isn't already stored
        if (!existingColisNumbers.has(colisNumber)) {
          // Extract reason
          const reasonElement = card.querySelector(".redo");
          const reason = reasonElement
            ? reasonElement.textContent.trim()
            : "Unknown";

          newRefusedColis.push({
            date: formattedDate,
            colis: colisNumber,
            raisonAnnulation: reason,
            livreur: livreur,
            description: "", // Empty as per requirement
          });
        }
      }
    });

    if (newRefusedColis.length > 0) {
      chrome.runtime.sendMessage({
        action: "storeRefusedColis",
        data: newRefusedColis,
      });
    }
  });
}

setTimeout(extractRefusedColis, 2000);

function printAllRetourTicketsWithIframes() {
  const allRows = document.querySelectorAll("tr");
  const printUrls = [];

  allRows.forEach((row) => {
    const statusCell = row.querySelector("td:nth-child(6) p");
    if (statusCell && statusCell.textContent.includes("Affecté livreur")) {
      const printBtn = row.querySelector("a[href*='PrintRetourTicket']");
      if (printBtn) {
        const printUrl = printBtn.href.startsWith("http")
          ? printBtn.href
          : `https://tms.marjanemall.ma${printBtn.getAttribute("href")}`;
        printUrls.push(printUrl);
      }
    }
  });

  console.log(`🔍 Found ${printUrls.length} retour tickets...`);

  let index = 0;

  function loadAndPrintNext() {
    if (index >= printUrls.length) return;

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = printUrls[index];

    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        alert(`🖨️ Printed: ${printUrls[index]}`);
      } catch (e) {
        console.warn("⚠️ Cannot print iframe:", e);
      }

      setTimeout(() => {
        iframe.remove();
        index++;
        loadAndPrintNext();
      }, 5000);
    };

    document.body.appendChild(iframe);
  }

  loadAndPrintNext();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "printRetourIframes") {
    printAllRetourTicketsWithIframes();
  }
});

var modalObserver = null;
if (
  document.body &&
  document.body instanceof Node &&
  (document.getElementById("js-affectation-coliszone-modal-body") ||
    window.location.pathname.toLowerCase().includes("affectation") ||
    window.location.pathname.toLowerCase().includes("tournee") ||
    window.location.pathname.toLowerCase().includes("hub") ||
    window.location.pathname.toLowerCase().includes("caissier"))
) {
  modalObserver = new MutationObserver(() => {
    const modalBody = document.getElementById(
      "js-affectation-coliszone-modal-body"
    );
    if (!modalBody) return;

    const forbiddenImg = modalBody.querySelector(
      '#js-colis-livreur-img[src$="forbidden.png"]'
    );
    const zoneText = modalBody.querySelector("#js-colis-livreur-zone-name-text");
    const affectButton = document.getElementById("js-affect-colis-to-zone-btn");
    console.log("Found button:", affectButton);

    if (
      forbiddenImg &&
      zoneText &&
      zoneText.textContent.includes("Zone Expédition vers l'entrepôt") &&
      affectButton &&
      affectButton.style.display !== "none"
    ) {
      console.log("🚫 Forbidden zone detected, hiding affect button");
      affectButton.remove();
    }
  });

  modalObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "searchTracking") {
    const trackingToFind = message.trackingToFind.trim();

    (async () => {
      // Select all Colis elements in the page
      const colisElements = document.querySelectorAll(
        ".text-green.font-weight-bold"
      );

      const colisNumbers = [...colisElements]
        .map((el) => {
          const match = el.textContent.match(/([G][A-Z]{2}\d{6,})|([0-9]{20})/);
          if (match) return match[0].trim();
          return null;
        })
        .filter(Boolean);

      let foundColis = null;
      let trackingResult = null;

      for (const colisNum of colisNumbers) {

        const apiColisNum = colisNum.endsWith("A") ? colisNum : colisNum + "A";

        try {
          const response = await fetch(
            `https://tms.marjanemall.ma/AffectationLivreur/Affectation/GetColisHistorique?cab=${apiColisNum}`,
            { credentials: "include" }
          );
          const data = await response.json();

          // Ensure we can handle array or single object
          const colisList = Array.isArray(data.data) ? data.data : [data.data];

          for (const colisItem of colisList) {
            const code = colisItem?.ColisNum?.trim();

            if (code === trackingToFind) {
              foundColis = apiColisNum;
              trackingResult = colisItem.TrackingCode;
              break;
            }
          }

          if (foundColis) break;
        } catch (error) {
          console.error("Erreur fetch pour", colisNum, ":", error);
        }
      }

      sendResponse({
        found: !!foundColis,
        colisNumber: foundColis,
        trackingCode: trackingResult,
      });
    })();

    return true; // keep channel open for async
  }
});

// --- Start Consultation page calls check ---
function parseJsonDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return new Date();
  const [day, month, year] = dateStr.split("/").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

// --- Start Consultation & Traitement Livreur parcel & calls check ---
function extractClientName(rootItem, card) {
  // 1. Try from API rootItem or json
  if (rootItem && typeof rootItem === "object") {
    const candidate = rootItem.Client ||
                      rootItem.NomClient ||
                      rootItem.Nom_Client ||
                      rootItem.Destinataire ||
                      rootItem.NomDestinataire ||
                      rootItem.Nom_Destinataire ||
                      rootItem.CustomerName ||
                      rootItem.Customer ||
                      rootItem.ClientName ||
                      rootItem.ReceiverName ||
                      rootItem.Consignee ||
                      rootItem.Nom ||
                      (rootItem.Colis && (rootItem.Colis.Client || rootItem.Colis.NomClient || rootItem.Colis.Destinataire));
    if (candidate && typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  // 2. Try from card DOM
  if (card && card.querySelector) {
    const attrName = card.getAttribute("data-client") ||
                     card.getAttribute("data-clientname") ||
                     card.getAttribute("data-destinataire") ||
                     card.getAttribute("data-customer");
    if (attrName && attrName.trim()) return attrName.trim();

    const selectors = [
      ".js-client-name",
      ".client-name",
      ".client",
      ".nom-client",
      ".js-destinataire",
      ".destinataire",
      ".customer-name",
      ".customer"
    ];
    for (const sel of selectors) {
      const el = card.querySelector(sel);
      if (el && el.textContent.trim()) {
        const text = el.textContent.replace(/^client\s*[:：]?\s*/i, "").replace(/^destinataire\s*[:：]?\s*/i, "").trim();
        if (text) return text;
      }
    }

    const elements = card.querySelectorAll("p, span, div, label, td, b, strong");
    for (const el of elements) {
      if (el.children.length === 0) {
        const text = el.textContent.trim();
        const match = text.match(/(?:client|destinataire|dest|nom)\s*[:：]\s*([A-Za-zÀ-ÿ\s'-]{2,})/i);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
  }

  return null;
}

function extractPrice(rootItem, card) {
  // 1. Try from API rootItem
  if (rootItem && typeof rootItem === "object") {
    const candidate = rootItem.Prix != null ? rootItem.Prix :
                     (rootItem.Montant != null ? rootItem.Montant :
                     (rootItem.CRBT != null ? rootItem.CRBT :
                     (rootItem.MontantCRBT != null ? rootItem.MontantCRBT :
                     (rootItem.Price != null ? rootItem.Price :
                     (rootItem.Total != null ? rootItem.Total :
                     (rootItem.Valeur != null ? rootItem.Valeur :
                     (rootItem.MontantTotal != null ? rootItem.MontantTotal :
                     (rootItem.PrixTotal != null ? rootItem.PrixTotal :
                     (rootItem.CodAmount != null ? rootItem.CodAmount :
                     (rootItem.Colis && (rootItem.Colis.Prix || rootItem.Colis.Montant || rootItem.Colis.CRBT)))))))))));
    if (candidate !== null && candidate !== undefined && candidate !== "") {
      const num = parseFloat(String(candidate).replace(/[^\d.,]/g, "").replace(",", "."));
      if (!isNaN(num)) {
        return `${num.toFixed(2)} DH`;
      }
      return String(candidate).trim();
    }
  }

  // 2. Try from card DOM
  if (card && card.querySelector) {
    const attrPrice = card.getAttribute("data-price") ||
                      card.getAttribute("data-prix") ||
                      card.getAttribute("data-montant") ||
                      card.getAttribute("data-crbt");
    if (attrPrice && attrPrice.trim()) {
      const num = parseFloat(attrPrice.replace(/[^\d.,]/g, "").replace(",", "."));
      if (!isNaN(num)) return `${num.toFixed(2)} DH`;
      return attrPrice.trim();
    }

    const selectors = [
      ".js-prix",
      ".prix",
      ".price",
      ".montant",
      ".crbt",
      ".js-crbt",
      ".js-montant"
    ];
    for (const sel of selectors) {
      const el = card.querySelector(sel);
      if (el && el.textContent.trim()) {
        const text = el.textContent.trim();
        const num = parseFloat(text.replace(/[^\d.,]/g, "").replace(",", "."));
        if (!isNaN(num)) return `${num.toFixed(2)} DH`;
        return text;
      }
    }

    const elements = card.querySelectorAll("p, span, div, label, td, b, strong");
    for (const el of elements) {
      if (el.children.length === 0) {
        const text = el.textContent.trim();
        const match = text.match(/(?:crbt|prix|montant|total)\s*[:：]?\s*([\d\s.,]+)\s*(?:dh|mad)?/i) ||
                      text.match(/\b([\d\s.,]+)\s*(?:dh|mad)\b/i);
        if (match && match[1]) {
          const num = parseFloat(match[1].replace(/\s/g, "").replace(",", "."));
          if (!isNaN(num)) {
            return `${num.toFixed(2)} DH`;
          }
        }
      }
    }
  }

  return null;
}

function extractAddress(rootItem, card) {
  // 1. Try from API rootItem or json
  if (rootItem && typeof rootItem === "object") {
    const candidate =
      rootItem.Adresse ||
      rootItem.AdresseClient ||
      rootItem.Adresse_Client ||
      rootItem.AdresseDestinataire ||
      rootItem.Adresse_Destinataire ||
      rootItem.Address ||
      rootItem.CustomerAddress ||
      rootItem.DeliveryAddress ||
      rootItem.Destination ||
      (rootItem.Colis &&
        (rootItem.Colis.Adresse ||
          rootItem.Colis.Address ||
          rootItem.Colis.AdresseClient));
    if (candidate && typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  // 2. Try from card DOM
  if (card && card.querySelector) {
    const attrAddr =
      card.getAttribute("data-adresse") ||
      card.getAttribute("data-address") ||
      card.getAttribute("data-destination");
    if (attrAddr && attrAddr.trim()) return attrAddr.trim();

    const selectors = [
      ".js-adresse",
      ".adresse",
      ".address",
      ".customer-address",
      ".destinataire-adresse",
    ];
    for (const sel of selectors) {
      const el = card.querySelector(sel);
      if (el && el.textContent.trim()) {
        const text = el.textContent
          .replace(/^adresse\s*[:：]?\s*/i, "")
          .trim();
        if (text) return text;
      }
    }

    const elements = card.querySelectorAll("p, span, div, label, td, b, strong");
    for (const el of elements) {
      if (el.children.length === 0) {
        const text = el.textContent.trim();
        const match = text.match(/(?:adresse|dest(?:ination)?)\s*[:：]\s*(.+)/i);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
  }

  return null;
}

function extractPhone(rootItem, card) {
  // 1. Try from API rootItem or json
  if (rootItem && typeof rootItem === "object") {
    const candidate =
      rootItem.Telephone ||
      rootItem.Tel ||
      rootItem.Phone ||
      rootItem.Mobile ||
      rootItem.CustomerPhone ||
      rootItem.ClientPhone ||
      rootItem.Contact ||
      rootItem.NumeroTelephone ||
      (rootItem.Colis &&
        (rootItem.Colis.Telephone ||
          rootItem.Colis.Tel ||
          rootItem.Colis.Phone ||
          rootItem.Colis.Mobile));
    if (candidate && typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  // 2. Try from card DOM
  if (card && card.querySelector) {
    const attrPhone =
      card.getAttribute("data-phone") ||
      card.getAttribute("data-tel") ||
      card.getAttribute("data-telephone");
    if (attrPhone && attrPhone.trim()) return attrPhone.trim();

    const selectors = [
      ".js-phone",
      ".js-telephone",
      ".phone",
      ".telephone",
      ".tel",
      "a[href^='tel:']",
    ];
    for (const sel of selectors) {
      const el = card.querySelector(sel);
      if (el && el.textContent.trim()) {
        const text = el.textContent
          .replace(/^t[ée]l[ée]phone\s*[:：]?\s*/i, "")
          .replace(/^tel\s*[:：]?\s*/i, "")
          .trim();
        if (text) return text;
      }
    }

    const elements = card.querySelectorAll("p, span, div, label, td, b, strong");
    for (const el of elements) {
      if (el.children.length === 0) {
        const text = el.textContent.trim();
        const match =
          text.match(/(?:t[ée]l(?:[ée]phone)?|contact|mobile)\s*[:：]\s*(\+?[0-9\s-]{8,})/i) ||
          text.match(/\b(\+?212[0-9\s-]{9,}|0[567][0-9\s-]{8,})\b/);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
  }

  return null;
}

// In-memory & session cache for ZoneColisList data
let zoneColisCache = null;
let zoneColisCacheTime = 0;
let zoneColisFetchPromise = null;
const ZONE_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

async function getZoneColisData(zoneId = 4) {
  const now = Date.now();
  if (zoneColisCache && now - zoneColisCacheTime < ZONE_CACHE_TTL) {
    return zoneColisCache;
  }

  // Check sessionStorage
  try {
    const stored = sessionStorage.getItem(`gof_zone_colis_${zoneId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        parsed &&
        parsed.timestamp &&
        now - parsed.timestamp < ZONE_CACHE_TTL &&
        parsed.data
      ) {
        zoneColisCache = parsed.data;
        zoneColisCacheTime = parsed.timestamp;
        return zoneColisCache;
      }
    }
  } catch (e) {
    // ignore sessionStorage errors
  }

  if (zoneColisFetchPromise) {
    return zoneColisFetchPromise;
  }

  zoneColisFetchPromise = (async () => {
    try {
      const targetUrl = `https://tms.marjanemall.ma/Hub/Consultation/ZoneColisList?zoneId=${zoneId}`;
      const response = await fetch(targetUrl, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} when fetching ZoneColisList`);
      }
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const colisData = {};

      const addColisItem = (colisNumber, clientName, price, address, phone, livreur) => {
        if (!colisNumber) return;
        const clean = (val) => {
          if (!val) return null;
          const t = val.trim();
          return t.length > 0 ? t : null;
        };

        let formattedPrice = clean(price);
        if (formattedPrice) {
          const num = parseFloat(formattedPrice.replace(/[^\d.,]/g, "").replace(",", "."));
          if (!isNaN(num)) {
            formattedPrice = `${num.toFixed(2)} DH`;
          }
        }

        const cleanCode = colisNumber.toUpperCase().trim();
        const baseCode = cleanCode.replace(/A$/, "");

        const item = {
          colis: cleanCode,
          client: clean(clientName),
          price: formattedPrice,
          address: clean(address),
          phone: clean(phone),
          livreur: clean(livreur)
        };

        colisData[cleanCode] = item;
        colisData[baseCode] = item;
        colisData[baseCode + "A"] = item;
      };

      // 1. Try parsing cards (.js-colis-details-row)
      const cardElements = Array.from(
        doc.querySelectorAll(".js-colis-details-row, #js-colis-list-infos .card, .card-custom")
      );

      if (cardElements.length > 0) {
        cardElements.forEach((card) => {
          const colisEl =
            card.querySelector(".text-green") ||
            card.querySelector(".card-header");
          const colisText = colisEl ? colisEl.textContent.trim() : card.textContent;
          const colisMatch = colisText.match(/Colis\s*N°\s*([A-Za-z0-9]+)/i);
          if (!colisMatch) return;

          const colisNumber = colisMatch[1].trim();

          const divs = Array.from(card.querySelectorAll(".card-body div, div.mb-1, div"));
          let clientName = null;
          let phone = null;
          let address = null;
          let price = null;
          let livreur = null;

          divs.forEach((d) => {
            const txt = d.textContent.trim();
            if (!clientName && /^Client\s*[:：]/i.test(txt)) {
              clientName = txt.replace(/^Client\s*[:：]\s*/i, "").trim() || null;
            } else if (!phone && /^T[ée]l[ée]phone\s*[:：]/i.test(txt)) {
              phone = txt.replace(/^T[ée]l[ée]phone\s*[:：]\s*/i, "").trim() || null;
            } else if (!address && /^Adresse\s*[:：]/i.test(txt)) {
              address = txt.replace(/^Adresse\s*[:：]\s*/i, "").trim() || null;
            } else if (!price && /^Prix\s*[:：]/i.test(txt)) {
              price = txt.replace(/^Prix\s*[:：]\s*/i, "").trim() || null;
            } else if (!livreur && /^Livreur\s*[:：]/i.test(txt)) {
              livreur = txt.replace(/^Livreur\s*[:：]\s*/i, "").trim() || null;
            }
          });

          addColisItem(colisNumber, clientName, price, address, phone, livreur);
        });
      }

      // 2. Regex card fallback over raw HTML
      if (Object.keys(colisData).length === 0) {
        const cardRegex = /<a[^>]*class="[^"]*js-colis-details-row[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        let cardMatch;
        while ((cardMatch = cardRegex.exec(html)) !== null) {
          const cardHtml = cardMatch[1];
          const colisMatch = cardHtml.match(/Colis\s*N°\s*([A-Za-z0-9]+)/i);
          if (!colisMatch) continue;

          const colisNumber = colisMatch[1].trim();
          const clientMatch = cardHtml.match(/Client\s*[:：]\s*([^<\r\n]+)/i);
          const telMatch = cardHtml.match(/T[ée]l[ée]phone\s*[:：]\s*([^<\r\n]+)/i);
          const addrMatch = cardHtml.match(/Adresse\s*[:：]\s*([^<\r\n]+)/i);
          const prixMatch = cardHtml.match(/Prix\s*[:：]\s*([\d\s.,]+)/i);
          const livreurMatch = cardHtml.match(/Livreur\s*[:：]\s*([^<\r\n]+)/i);

          addColisItem(
            colisNumber,
            clientMatch ? clientMatch[1] : null,
            prixMatch ? prixMatch[1] : null,
            addrMatch ? addrMatch[1] : null,
            telMatch ? telMatch[1] : null,
            livreurMatch ? livreurMatch[1] : null
          );
        }
      }

      // 3. Table fallback (in case some views use a table)
      if (Object.keys(colisData).length === 0) {
        const tables = doc.querySelectorAll("table");
        if (tables && tables.length > 0) {
          const table = Array.from(tables).sort(
            (a, b) => b.querySelectorAll("tr").length - a.querySelectorAll("tr").length
          )[0];
          const rows = Array.from(table.querySelectorAll("tr"));

          let headerRowIdx = -1;
          const colMap = { colis: -1, client: -1, price: -1, address: -1, phone: -1 };

          for (let r = 0; r < Math.min(rows.length, 6); r++) {
            const cells = Array.from(rows[r].querySelectorAll("th, td"));
            const cleanTexts = cells.map((c) =>
              (c.textContent || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            );

            const colisIdx = cleanTexts.findIndex((t) =>
              t.includes("colis") || t.includes("code barre") || t.includes("cab") || t.includes("tracking") || t.includes("envoi")
            );

            if (colisIdx !== -1) {
              headerRowIdx = r;
              colMap.colis = colisIdx;
              colMap.client = cleanTexts.findIndex((t) => t.includes("client") || t.includes("destinataire") || t.includes("nom"));
              colMap.price = cleanTexts.findIndex((t) => t.includes("prix") || t.includes("montant") || t.includes("crbt") || t.includes("total"));
              colMap.address = cleanTexts.findIndex((t) => t.includes("adresse") || t.includes("destination") || t.includes("ville"));
              colMap.phone = cleanTexts.findIndex((t) => t.includes("tel") || t.includes("phone") || t.includes("contact"));
              break;
            }
          }

          const dataRows = headerRowIdx !== -1 ? rows.slice(headerRowIdx + 1) : rows;

          dataRows.forEach((row) => {
            const cells = Array.from(row.querySelectorAll("td, th"));
            if (cells.length === 0) return;

            let colisNumber = colMap.colis !== -1 && cells[colMap.colis] ? cells[colMap.colis].textContent.trim() : "";
            if (!colisNumber) {
              for (const c of cells) {
                const text = c.textContent.trim();
                const m = text.match(/\b((?:GOF|GMK|GMH|GFS|GTG|GRB)[A-Za-z0-9]+)\b/i) || text.match(/\b(\d{10,24})\b/);
                if (m) { colisNumber = m[1]; break; }
              }
            }
            if (!colisNumber) return;

            const clientName = colMap.client !== -1 && cells[colMap.client] ? cells[colMap.client].textContent.trim() : null;
            const price = colMap.price !== -1 && cells[colMap.price] ? cells[colMap.price].textContent.trim() : null;
            const address = colMap.address !== -1 && cells[colMap.address] ? cells[colMap.address].textContent.trim() : null;
            const phone = colMap.phone !== -1 && cells[colMap.phone] ? cells[colMap.phone].textContent.trim() : null;

            addColisItem(colisNumber, clientName, price, address, phone, null);
          });
        }
      }

      zoneColisCache = colisData;
      zoneColisCacheTime = Date.now();

      try {
        sessionStorage.setItem(
          `gof_zone_colis_${zoneId}`,
          JSON.stringify({ timestamp: zoneColisCacheTime, data: colisData })
        );
      } catch (e) {}

      console.log(
        `GoFleet: Successfully indexed ${Object.keys(colisData).length} entries from ZoneColisList`
      );
      return colisData;
    } catch (err) {
      console.error("GoFleet: Error loading ZoneColisList:", err);
      return {};
    } finally {
      zoneColisFetchPromise = null;
    }
  })();

  return zoneColisFetchPromise;
}

function getActiveZoneId() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("zoneId")) return urlParams.get("zoneId");
    const zoneSelect = document.querySelector(
      "select[name*='zone' i], select#zoneId, select#ZoneId"
    );
    if (zoneSelect && zoneSelect.value) return zoneSelect.value;
  } catch (e) {}
  return 4;
}

async function processConsultationPageCalls() {
  if (!isConsultationOrTraitementLivreurPage()) {
    return;
  }

  const cardSelector =
    ".js-colis-data:not(.calls-processed):not(.calls-processing), " +
    ".js-colis-details-row:not(.calls-processed):not(.calls-processing), " +
    "#js-colis-list-infos .card:not(.calls-processed):not(.calls-processing), " +
    "#js-colis-list-info .card:not(.calls-processed):not(.calls-processing), " +
    ".colis-card:not(.calls-processed):not(.calls-processing), " +
    "[data-colinum]:not(.calls-processed):not(.calls-processing), " +
    ".card:not(.calls-processed):not(.calls-processing)";
  const rawCards = Array.from(document.querySelectorAll(cardSelector));
  const cards = rawCards.filter((card) => {
    if (card.parentElement?.closest(".js-colis-data, .js-colis-details-row, .colis-card")) return false;
    if (card.querySelector(".js-colis-data, .js-colis-details-row, .colis-card")) return false;
    const text = card.textContent || "";
    return card.hasAttribute("data-colinum") ||
           card.hasAttribute("data-colis") ||
           /\b(?:GOF|GMK|GMH|GFS|GTG|GRB)[A-Za-z0-9]+\b/i.test(text) ||
           /Colis\s*N°/i.test(text) ||
           /Retour\s*N°/i.test(text);
  });
  if (cards.length === 0) return;

  cards.forEach((card) => card.classList.add("calls-processing"));

  const zoneId = getActiveZoneId();
  let zoneColisMap = {};
  try {
    const zoneColisPromise = Promise.race([
      getZoneColisData(zoneId),
      new Promise((resolve) => setTimeout(() => resolve({}), 8000))
    ]);
    zoneColisMap = await zoneColisPromise;
  } catch (err) {
    console.warn("GoFleet: could not load zone colis data", err);
  }

  cards.forEach(async (card) => {
    card.classList.remove("calls-processing");
    card.classList.add("calls-processed");
    let colinum =
      card.getAttribute("data-colinum") ||
      card.getAttribute("data-colis") ||
      card.getAttribute("data-code") ||
      card.querySelector("h6.style-87")?.textContent?.replace(/Colis\s*N°/i, "").trim() ||
      card.querySelector(".text-green")?.textContent?.replace(/Colis\s*N°/i, "").trim() ||
      card.querySelector(".colis-num, .tracking-number, .js-barcode-text")?.textContent?.trim();

    if (!colinum) {
      const cardText = card.textContent || "";
      const match =
        cardText.match(/\b((?:GOF|GMK|GMH|GFS|GTG|GRB)[A-Za-z0-9]+)\b/i) ||
        cardText.match(/\b([A-Z]{2}[0-9]{9}[A-Z]{2})\b/) ||
        cardText.match(/\b(CD[0-9]{9})\b/) ||
        cardText.match(/\b(LCWK[0-9A-Z]+)\b/i);
      if (match) {
        colinum = match[1].trim();
      }
    }
    if (!colinum) return;

    const cleanNum = colinum.trim().toUpperCase();
    const zoneInfo =
      zoneColisMap[cleanNum] ||
      zoneColisMap[cleanNum.replace(/A$/, "")] ||
      zoneColisMap[cleanNum + "A"] ||
      null;

    const apiColisNum = colinum.endsWith("A") ? colinum : colinum + "A";

    try {
      const baseUrl = window.location.origin || "https://tms.marjanemall.ma";
      const response = await fetch(
        `${baseUrl}/AffectationLivreur/Affectation/GetColisHistorique?cab=${apiColisNum}`,
        { credentials: "include" }
      );
      const json = await response.json();

      let rootItem = null;
      let details = [];
      if (json && json.Success && json.data) {
        if (Array.isArray(json.data.detail)) {
          details = json.data.detail;
          rootItem = json.data;
        } else if (Array.isArray(json.data)) {
          rootItem =
            json.data.find(
              (d) =>
                (d.ColisNum || "").trim() === apiColisNum ||
                (d.TrackingCode || "").trim() === apiColisNum ||
                (d.ColisNum || "").trim() === colinum ||
                (d.TrackingCode || "").trim() === colinum
            ) || json.data[0];
          if (rootItem && Array.isArray(rootItem.detail)) {
            details = rootItem.detail;
          }
        } else if (typeof json.data === "object") {
          rootItem = json.data;
          if (Array.isArray(json.data.detail)) details = json.data.detail;
        }
      }

      const clientName =
        (zoneInfo && zoneInfo.client) ||
        extractClientName(rootItem || (json && json.data) || json, card);
      const price =
        (zoneInfo && zoneInfo.price) ||
        extractPrice(rootItem || (json && json.data) || json, card);
      const address =
        (zoneInfo && zoneInfo.address) ||
        extractAddress(rootItem || (json && json.data) || json, card);
      const phone =
        (zoneInfo && zoneInfo.phone) ||
        extractPhone(rootItem || (json && json.data) || json, card);

      const deliveryAttempts = [];
      let currentAttempt = null;

      if (Array.isArray(details)) {
        details.forEach((item) => {
          const status = item.ColisStatut || "";

          if (status.includes("Pris en charge") || status.includes("Sorti pour livraison") || status.includes("livreur")) {
            currentAttempt = {
              date: parseJsonDateTime(item.DateColis, item.TimeColis),
              injoignableItems: [],
            };
            deliveryAttempts.push(currentAttempt);
          }

          if (status.includes("Injoignable")) {
            if (!currentAttempt) {
              currentAttempt = {
                date: parseJsonDateTime(item.DateColis, item.TimeColis),
                injoignableItems: [],
              };
              deliveryAttempts.push(currentAttempt);
            }
            const date = parseJsonDateTime(item.DateColis, item.TimeColis);
            currentAttempt.injoignableItems.push({ date, item });
          }
        });
      }

      if (
        deliveryAttempts.length === 0 &&
        !clientName &&
        !price &&
        !address
      ) {
        return;
      }

      const container = document.createElement("div");
      container.className = "gof-colis-enhancement";
      Object.assign(container.style, {
        marginTop: "12px",
        padding: "10px 14px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      });

      // 1. Parcel Header (Client Name, Phone & Price)
      if (clientName || price || phone) {
        const headerRow = document.createElement("div");
        Object.assign(headerRow.style, {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
          paddingBottom:
            address || deliveryAttempts.length > 0 ? "8px" : "0",
          borderBottom:
            address || deliveryAttempts.length > 0
              ? "1px solid #e2e8f0"
              : "none",
        });

        if (clientName || phone) {
          const clientDiv = document.createElement("div");
          Object.assign(clientDiv.style, {
            display: "inline-flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "6px",
            fontSize: "12.5px",
            color: "#334155",
          });

          let clientHtml = `
            <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#e0e7ff;color:#4338ca;font-size:12px;">👤</span>
            <span>Client : <strong style="color: #0f172a; font-weight: 700;">${
              clientName || "Non spécifié"
            }</strong></span>
          `;

          if (phone) {
            clientHtml += `
              <a href="tel:${phone}" style="display:inline-flex;align-items:center;gap:4px;margin-left:4px;padding:2px 8px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;border-radius:6px;font-size:11.5px;font-weight:600;text-decoration:none;">
                <span>📞</span>
                <span>${phone}</span>
              </a>
            `;
          }

          clientDiv.innerHTML = clientHtml;
          headerRow.appendChild(clientDiv);
        }

        if (price) {
          const priceDiv = document.createElement("div");
          Object.assign(priceDiv.style, {
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "3px 10px",
            background: "#ecfdf5",
            color: "#047857",
            border: "1px solid #a7f3d0",
            borderRadius: "14px",
            fontSize: "12.5px",
            fontWeight: "700",
          });
          priceDiv.innerHTML = `
            <span>💰</span>
            <span>${price}</span>
          `;
          headerRow.appendChild(priceDiv);
        }

        container.appendChild(headerRow);
      }

      // 2. Address Row
      if (address) {
        const addressRow = document.createElement("div");
        Object.assign(addressRow.style, {
          display: "flex",
          alignItems: "flex-start",
          gap: "6px",
          fontSize: "12px",
          color: "#475569",
          paddingBottom: deliveryAttempts.length > 0 ? "8px" : "0",
          borderBottom:
            deliveryAttempts.length > 0 ? "1px solid #e2e8f0" : "none",
          lineHeight: "1.4",
        });
        addressRow.innerHTML = `
          <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#fee2e2;color:#dc2626;font-size:11px;flex-shrink:0;margin-top:1px;">📍</span>
          <span>Adresse : <strong style="color: #1e293b; font-weight: 600;">${address}</strong></span>
        `;
        container.appendChild(addressRow);
      }

      // 2. Delivery Attempts Timeline
      if (deliveryAttempts.length > 0) {
        const attemptsWrapper = document.createElement("div");
        Object.assign(attemptsWrapper.style, {
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          alignItems: "center"
        });

        deliveryAttempts.forEach((attempt, index) => {
          const injoignableItems = attempt.injoignableItems;
          const isZeroCalls = injoignableItems.length === 0;

          let hasInvalidCall = false;
          for (let i = 1; i < injoignableItems.length; i++) {
            const timeDiff = (injoignableItems[i].date - injoignableItems[i - 1].date) / 60000;
            if (timeDiff < 90) hasInvalidCall = true;
          }

          const isSuccess = injoignableItems.length >= 3 && !hasInvalidCall;
          const isWarning = injoignableItems.length > 0 && !isSuccess;

          const attemptCard = document.createElement("div");
          Object.assign(attemptCard.style, {
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 10px",
            borderRadius: "8px",
            fontSize: "12px",
            transition: "all 0.2s ease",
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
          });

          const dateStr = isNaN(attempt.date) ? "" : `${String(attempt.date.getDate()).padStart(2, '0')}/${String(attempt.date.getMonth() + 1).padStart(2, '0')}`;

          if (isZeroCalls) {
            // Clean subtle neutral badge for 0 calls
            attemptCard.style.backgroundColor = "#f1f5f9";
            attemptCard.style.border = "1px solid #cbd5e1";
            attemptCard.style.color = "#475569";

            attemptCard.innerHTML = `
              <span style="font-weight:700; color:#334155; background:#e2e8f0; padding:2px 6px; border-radius:4px; font-size:11px;">T${index + 1}${dateStr ? ` (${dateStr})` : ''}</span>
              <span style="display:inline-flex; align-items:center; gap:5px; color:#64748b; font-weight:500;">
                <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#94a3b8;"></span>
                Aucun appel
              </span>
            `;
          } else {
            // 1 or more calls
            const theme = isSuccess
              ? {
                  bg: "#ecfdf5",
                  border: "#a7f3d0",
                  titleBg: "#dcfce7",
                  titleColor: "#15803d",
                  summaryColor: "#065f46"
                }
              : {
                  bg: "#fffbeb",
                  border: "#fde68a",
                  titleBg: "#fef3c7",
                  titleColor: "#b45309",
                  summaryColor: "#92400e"
                };

            attemptCard.style.backgroundColor = theme.bg;
            attemptCard.style.border = `1px solid ${theme.border}`;
            attemptCard.style.color = theme.summaryColor;

            const titleSpan = document.createElement("span");
            Object.assign(titleSpan.style, {
              fontWeight: "700",
              color: theme.titleColor,
              backgroundColor: theme.titleBg,
              padding: "2px 6px",
              borderRadius: "4px",
              fontSize: "11px"
            });
            titleSpan.textContent = `T${index + 1}${dateStr ? ` (${dateStr})` : ''}`;
            attemptCard.appendChild(titleSpan);

            const callsSpan = document.createElement("span");
            Object.assign(callsSpan.style, {
              fontWeight: "700",
              fontSize: "12px",
              color: theme.summaryColor
            });
            callsSpan.textContent = `${injoignableItems.length} appel${injoignableItems.length > 1 ? 's' : ''}`;
            attemptCard.appendChild(callsSpan);

            const timelineSpan = document.createElement("span");
            Object.assign(timelineSpan.style, {
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11.5px",
              color: "#475569"
            });

            timelineSpan.appendChild(document.createTextNode("("));

            injoignableItems.forEach((item, i) => {
              const timeStr = `${String(item.date.getHours()).padStart(2, '0')}:${String(item.date.getMinutes()).padStart(2, '0')}`;
              const timeEl = document.createElement("span");
              timeEl.style.fontWeight = "600";
              timeEl.style.color = "#1e293b";
              timeEl.textContent = timeStr;
              timelineSpan.appendChild(timeEl);

              if (i > 0) {
                const timeDiff = (item.date - injoignableItems[i - 1].date) / 60000;
                const diffMinutes = Math.round(timeDiff);
                const isValid = timeDiff >= 90;

                const intervalBadge = document.createElement("span");
                Object.assign(intervalBadge.style, {
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "600",
                  backgroundColor: isValid ? "#dcfce7" : "#fee2e2",
                  color: isValid ? "#15803d" : "#b91c1c",
                  border: `1px solid ${isValid ? '#86efac' : '#fca5a5'}`
                });
                intervalBadge.title = isValid
                  ? `Intervalle valide : ${diffMinutes} min (>= 90 min)`
                  : `Intervalle non respecté : ${diffMinutes} min (< 90 min)`;
                intervalBadge.textContent = `${isValid ? '✅' : '❌'} ${diffMinutes}m`;
                timelineSpan.appendChild(intervalBadge);
              }

              if (i < injoignableItems.length - 1) {
                const arrow = document.createTextNode(" → ");
                timelineSpan.appendChild(arrow);
              }
            });

            timelineSpan.appendChild(document.createTextNode(")"));
            attemptCard.appendChild(timelineSpan);
          }

          attemptsWrapper.appendChild(attemptCard);
        });

        container.appendChild(attemptsWrapper);
      }

      const targetParent = card.querySelector(".card-body") || card;
      const existing = card.querySelector(".gof-colis-enhancement");
      if (existing) existing.remove();
      targetParent.appendChild(container);
      
    } catch (e) {
      console.error("Error fetching historique for", colinum, e);
    }
  });
}

var consultationObserver = null;
if (isConsultationOrTraitementLivreurPage()) {
  function startConsultationObserver() {
    if (document.body && document.body instanceof Node) {
      if (consultationObserver) consultationObserver.disconnect();
      consultationObserver = new MutationObserver(() => {
        processConsultationPageCalls();
        extractRefusedColis();
      });

      consultationObserver.observe(document.body, { childList: true, subtree: true });
      processConsultationPageCalls();
      extractRefusedColis();
      setTimeout(processConsultationPageCalls, 500);
      setTimeout(processConsultationPageCalls, 1500);
      setTimeout(processConsultationPageCalls, 3000);
    } else {
      setTimeout(startConsultationObserver, 200);
    }
  }
  startConsultationObserver();
}
// --- End Consultation page calls check ---

// --- Start Colis Counter ---
var lastColisCount = -1;

function findColisScannesElement() {
  const all = document.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    for (let j = 0; j < el.childNodes.length; j++) {
      const node = el.childNodes[j];
      if (node.nodeType === 3 && node.nodeValue.toLowerCase().includes("colis scann")) {
        return el;
      }
    }
  }
  return null;
}

function updateColisCounter() {
  if (!window.location.pathname.includes("/TourneeMM/Expedition/EditPaletteWithColis")) return;
  
  const count = document.querySelectorAll('.js-colis-details-row').length;
  if (count === lastColisCount) return;
  lastColisCount = count;
  
  let counterEl = document.getElementById("gof-colis-counter");
  if (!counterEl) {
    counterEl = document.createElement("span");
    counterEl.id = "gof-colis-counter";
    Object.assign(counterEl.style, {
      backgroundColor: "#2c3e50",
      color: "#ecf0f1",
      padding: "4px 8px",
      borderRadius: "12px",
      fontSize: "14px",
      fontWeight: "bold",
      marginLeft: "10px",
      display: "inline-block"
    });
    
    const targetEl = findColisScannesElement();
    if (targetEl) {
      targetEl.appendChild(counterEl);
    } else {
      // Fallback
      Object.assign(counterEl.style, { position: "fixed", top: "80px", right: "20px", zIndex: "9999" });
      document.body.appendChild(counterEl);
    }
  }
  
  counterEl.textContent = `Total : ${count}`;
}

var colisCounterObserver = null;
if (
  window.location.pathname.includes("/TourneeMM/Expedition/EditPaletteWithColis") &&
  document.body &&
  document.body instanceof Node
) {
  colisCounterObserver = new MutationObserver((mutations) => {
    const isSelfMutation = mutations.every(
      (m) =>
        m.target.id === "gof-colis-counter" ||
        (m.target.parentNode && m.target.parentNode.id === "gof-colis-counter")
    );
    if (!isSelfMutation) {
      updateColisCounter();
    }
  });
  colisCounterObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(updateColisCounter, 1000);
}
// --- End Colis Counter ---

// --- Replace Website Scanner Button with Native App Button (In-Place Substitution) ---
(function() {
  function findWebsiteScannerButton() {
    var barcodeInput = document.getElementById('js-barcode-input') ||
                       document.querySelector('input[name*="code" i], input[name*="cab" i], input[name*="bar" i], input[name*="colis" i], input[placeholder*="scan" i], input[placeholder*="code" i], input[placeholder*="colis" i], input[placeholder*="barre" i]');

    if (barcodeInput) {
      // 1. Check parent container (the immediate form group or row where input and "ou" live)
      var container = barcodeInput.closest('form') ||
                      barcodeInput.closest('.row') ||
                      barcodeInput.closest('.form-group') ||
                      barcodeInput.closest('.d-flex') ||
                      barcodeInput.parentElement;

      if (container) {
        // Check direct siblings of barcodeInput first!
        var siblings = Array.from(barcodeInput.parentElement ? barcodeInput.parentElement.children : []);
        for (var s = 0; s < siblings.length; s++) {
          var sib = siblings[s];
          if (sib === barcodeInput || sib.id === 'chrono-inline-scan-btn' || sib.dataset.chronoAppButton === 'true') continue;
          var sText = (sib.textContent || '').replace(/\u00A0/g, ' ').trim().toLowerCase();
          var sCls = (typeof sib.className === 'string' ? sib.className : '').toLowerCase();
          var sIcon = sib.querySelector && sib.querySelector('.fa-barcode, .fa-camera, .fa-qrcode, [class*="barcode"], [class*="scan"], [class*="qrcode"], svg, img');
          if (sText === 'scanner' || sText === 'scan' || (sIcon && (sText.includes('scan') || sCls.includes('btn')))) {
            return sib.closest('button, a, [role="button"], .btn') || sib;
          }
        }

        // Next check any button-like element inside the container
        var candidates = Array.from(container.querySelectorAll('button:not([data-chrono-app-button="true"]), a:not([data-chrono-app-button="true"]), [role="button"]:not([data-chrono-app-button="true"]), .btn:not([data-chrono-app-button="true"]), span[class*="btn"], div[class*="btn"], input[type="button"], input[type="submit"]'));
        for (var i = 0; i < candidates.length; i++) {
          var el = candidates[i];
          if (el === barcodeInput || el.id === 'chrono-inline-scan-btn' || el.dataset.chronoAppButton === 'true') continue;
          if (el.contains(barcodeInput)) continue;

          var text = (el.textContent || '').replace(/\u00A0/g, ' ').trim().toLowerCase();
          var id = (el.id || '').toLowerCase();
          var cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
          var hasScanIcon = el.querySelector && el.querySelector('.fa-barcode, .fa-camera, .fa-qrcode, [class*="barcode"], [class*="scan"], [class*="qrcode"], svg, img');

          var isScan = (
            text === 'scanner' ||
            text === 'scan' ||
            (text.includes('scanner') && !text.includes('colis scann')) ||
            (hasScanIcon && (text.includes('scan') || cls.includes('btn') || el.tagName === 'BUTTON' || el.tagName === 'A')) ||
            cls.includes('btn-scanner') || cls.includes('js-scanner') ||
            id.includes('scanner')
          );

          if (isScan) {
            var btnTarget = el.closest('button, a, [role="button"], .btn') || el;
            if (btnTarget && !btnTarget.contains(barcodeInput)) {
              return btnTarget;
            }
          }
        }
      }
    }

    // 2. Global search in main content area ONLY (never match navbar/sidebar/drawer)
    var contentArea = document.querySelector('.page-content, .content, main, #content, .container, .container-fluid, body') || document.body;
    if (contentArea) {
      var allButtons = Array.from(contentArea.querySelectorAll('button:not([data-chrono-app-button="true"]), a:not([data-chrono-app-button="true"]), [role="button"]:not([data-chrono-app-button="true"]), .btn:not([data-chrono-app-button="true"])'));
      for (var j = 0; j < allButtons.length; j++) {
        var b = allButtons[j];
        // STRICTLY IGNORE header, navbar, sidebar, menu, drawer
        if (b.closest('nav, header, .sidebar, .navbar, .menu, #sidebar, .drawer, #drawer, [class*="nav"], [class*="sidebar"]')) continue;

        var t = (b.textContent || '').replace(/\u00A0/g, ' ').trim().toLowerCase();
        var bId = (b.id || '').toLowerCase();
        var bCls = (typeof b.className === 'string' ? b.className : '').toLowerCase();
        var bIcon = b.querySelector && b.querySelector('.fa-barcode, .fa-camera, .fa-qrcode, [class*="barcode"], [class*="scan"], [class*="qrcode"], svg, img');

        var isSiteScan = (
          t === 'scanner' ||
          t === 'scan' ||
          (t.includes('scanner') && !t.includes('colis scann')) ||
          (bIcon && (t.includes('scan') || bCls.includes('btn') || b.tagName === 'BUTTON' || b.tagName === 'A')) ||
          bCls.includes('btn-scanner') || bCls.includes('js-scanner') ||
          bId.includes('scanner')
        );

        if (isSiteScan) {
          return b;
        }
      }
    }

    return null;
  }

  function replaceWebsiteScannerButton() {
    var barcodeInput = document.getElementById('js-barcode-input') ||
                       document.querySelector('input[name*="code" i], input[name*="cab" i], input[name*="bar" i], input[name*="colis" i], input[placeholder*="scan" i], input[placeholder*="code" i], input[placeholder*="colis" i], input[placeholder*="barre" i]');

    var siteScanBtn = findWebsiteScannerButton();

    // Create our native red scan button if not already created
    var inlineBtn = document.getElementById('chrono-inline-scan-btn');
    if (!inlineBtn) {
      inlineBtn = document.createElement('button');
      inlineBtn.id = 'chrono-inline-scan-btn';
      inlineBtn.type = 'button';
      inlineBtn.dataset.chronoAppButton = 'true';
      inlineBtn.style.display = 'inline-flex';
      inlineBtn.style.alignItems = 'center';
      inlineBtn.style.justifyContent = 'center';
      inlineBtn.style.gap = '6px';
      inlineBtn.style.backgroundColor = '#E30613';
      inlineBtn.style.borderColor = '#C40510';
      inlineBtn.style.color = '#FFFFFF';
      inlineBtn.style.fontWeight = 'bold';
      inlineBtn.style.fontSize = '14px';
      inlineBtn.style.borderRadius = '20px';
      inlineBtn.style.padding = '7px 16px';
      inlineBtn.style.cursor = 'pointer';
      inlineBtn.style.verticalAlign = 'middle';
      inlineBtn.style.boxShadow = '0 2px 6px rgba(227,6,19,0.3)';
      inlineBtn.innerHTML = '<svg style="width:18px;height:18px;fill:currentColor;vertical-align:middle;margin-right:4px;" viewBox="0 0 24 24"><path d="M2 4h2v16H2V4zm3 0h1v16H5V4zm3 0h2v16H8V4zm3 0h3v16h-3V4zm4 0h1v16h-1V4zm2 0h2v16h-2V4zm3 0h1v16h-1V4z"/></svg><span>Scanner</span>';

      inlineBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (window.AndroidApp && window.AndroidApp.launchScanner) {
          window.AndroidApp.launchScanner();
        }
      });
    }

    if (siteScanBtn) {
      // 1. Hide the website scanner button completely
      siteScanBtn.style.setProperty('display', 'none', 'important');
      siteScanBtn.style.setProperty('visibility', 'hidden', 'important');
      siteScanBtn.style.setProperty('width', '0', 'important');
      siteScanBtn.style.setProperty('height', '0', 'important');
      siteScanBtn.style.setProperty('margin', '0', 'important');
      siteScanBtn.style.setProperty('padding', '0', 'important');
      siteScanBtn.style.setProperty('opacity', '0', 'important');
      siteScanBtn.style.setProperty('pointer-events', 'none', 'important');

      // 2. Insert our red button in the EXACT place of the website button!
      if (inlineBtn.parentNode !== siteScanBtn.parentNode || inlineBtn.nextSibling !== siteScanBtn) {
        siteScanBtn.parentNode.insertBefore(inlineBtn, siteScanBtn);
      }

      // Also hide any other duplicate button with text "scanner" in the same container
      if (siteScanBtn.parentElement) {
        Array.from(siteScanBtn.parentElement.children).forEach(function(child) {
          if (child === inlineBtn || child === barcodeInput || child.dataset.chronoAppButton === 'true') return;
          var ct = (child.textContent || '').replace(/\u00A0/g, ' ').trim().toLowerCase();
          var cIcon = child.querySelector && child.querySelector('.fa-barcode, .fa-camera, .fa-qrcode, [class*="barcode"], [class*="scan"], [class*="qrcode"], svg, img');
          if (ct === 'scanner' || ct === 'scan' || (cIcon && (ct.includes('scan') || (child.className && child.className.includes && child.className.includes('btn'))))) {
            child.style.setProperty('display', 'none', 'important');
            child.style.setProperty('visibility', 'hidden', 'important');
            child.style.setProperty('pointer-events', 'none', 'important');
          }
        });
      }
    } else if (barcodeInput && !inlineBtn.parentNode) {
      // Fallback if website button not present: insert next to barcode input
      if (barcodeInput.nextSibling) {
        barcodeInput.parentNode.insertBefore(inlineBtn, barcodeInput.nextSibling);
      } else {
        barcodeInput.parentNode.appendChild(inlineBtn);
      }
    }
  }

  replaceWebsiteScannerButton();
  if (!window._chronoScanObs && document.body) {
    window._chronoScanObs = new MutationObserver(replaceWebsiteScannerButton);
    window._chronoScanObs.observe(document.body, { childList: true, subtree: true });
  }
})();
// --- End Replace Website Scanner Button ---

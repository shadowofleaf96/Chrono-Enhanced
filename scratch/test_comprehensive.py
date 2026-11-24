from cdp_helper import eval_js
import subprocess
import time

comprehensive_css = """
/* ==========================================================================
   1. TRIP MANAGER DETAILS (CHOSEN TRIP) RESPONSIVE STYLING
   ========================================================================== */

/* Top Summary Card (Items Wrapper) */
[class*="itemsWrapper-"] {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 4px !important;
}

[class*="itemsWrapper-"] > [class*="item-"] {
  flex: 0 0 calc(50% - 4px) !important;
  max-width: calc(50% - 4px) !important;
  min-width: 130px !important;
  box-sizing: border-box !important;
  padding: 8px 10px !important;
  background: #f8fafc !important;
  border-radius: 8px !important;
  border: 1px solid #e2e8f0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
}

/* Make Driver or Vendor take full width if long */
[class*="itemsWrapper-"] > [class*="item-"]:nth-child(2),
[class*="itemsWrapper-"] > [class*="item-"]:nth-child(5) {
  flex: 0 0 100% !important;
  max-width: 100% !important;
}

[class*="itemsWrapper-"] > [class*="item-"] span:first-child,
[class*="itemsWrapper-"] > [class*="item-"] div:first-child {
  font-size: 11px !important;
  color: #64748b !important;
  font-weight: 500 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.3px !important;
}

[class*="itemsWrapper-"] > [class*="item-"] span:last-child,
[class*="itemsWrapper-"] > [class*="item-"] div:last-child {
  font-size: 13.5px !important;
  color: #0f172a !important;
  font-weight: 700 !important;
}

/* Tabs and Header Row Wrapping in Trip Details */
[class*="tableContainer-"] .ant-tabs-nav,
.ant-tabs-top > .ant-tabs-nav,
[class*="tabsCardsContainer-"] .ant-tabs-nav {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  width: 100% !important;
  margin-bottom: 8px !important;
}

.ant-tabs-nav-wrap {
  width: 100% !important;
  max-width: 100vw !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch !important;
  padding-bottom: 4px !important;
}

.ant-tabs-nav-list {
  display: flex !important;
  flex-wrap: nowrap !important;
  gap: 6px !important;
}

.ant-tabs-tab {
  min-height: 38px !important;
  padding: 6px 14px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  border-radius: 20px !important;
  white-space: nowrap !important;
  touch-action: manipulation !important;
}

.ant-tabs-extra-content {
  width: 100% !important;
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  margin-top: 6px !important;
  padding: 2px 4px !important;
}

.ant-tabs-extra-content input,
.ant-tabs-extra-content .ant-input-search {
  max-width: 100% !important;
  flex: 1 1 180px !important;
  height: 38px !important;
  border-radius: 8px !important;
}

/* Consignments Table in Trip Details */
.ant-table-wrapper {
  width: 100% !important;
  max-width: 100vw !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch !important;
}

.ant-table {
  font-size: 12.5px !important;
}

.ant-table-thead > tr > th {
  padding: 8px 8px !important;
  background: #f1f5f9 !important;
  font-size: 11.5px !important;
  font-weight: 700 !important;
  white-space: nowrap !important;
}

.ant-table-tbody > tr > td {
  padding: 8px 8px !important;
  font-size: 12.5px !important;
}

/* Cards inside Sub-Tabs (e.g. Trip Details, Tracking, Drops) */
[class*="rowContainer-"] .ant-row,
[class*="tabsCardsContainer-"] .ant-row,
.ant-card .ant-row {
  display: flex !important;
  flex-wrap: wrap !important;
  row-gap: 8px !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}

[class*="rowContainer-"] .ant-col,
[class*="tabsCardsContainer-"] .ant-col,
.ant-card .ant-col {
  padding: 4px 6px !important;
  box-sizing: border-box !important;
  word-break: normal !important;
  overflow-wrap: break-word !important;
}

[class*="rowContainer-"] .ant-col-6,
[class*="rowContainer-"] .ant-col-8,
[class*="tabsCardsContainer-"] .ant-col-6,
[class*="tabsCardsContainer-"] .ant-col-8,
.ant-card .ant-col-6,
.ant-card .ant-col-8 {
  flex: 0 0 50% !important;
  max-width: 50% !important;
  width: 50% !important;
}

/* ==========================================================================
   2. CONSIGNMENT DETAILS PAGE RESPONSIVE STYLING (/ops/details/:id)
   ========================================================================== */
[class*="rowContainer-"] {
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 8px !important;
  background: #ffffff !important;
  border-radius: 10px !important;
  border: 1px solid #e2e8f0 !important;
  margin-bottom: 10px !important;
}

/* ==========================================================================
   3. FLOATING STATUS WIDGET COLLAPSIBLE STYLING
   ========================================================================== */
.chrono-status-widget {
  position: fixed !important;
  bottom: 16px !important;
  right: 14px !important;
  z-index: 99999 !important;
  width: 320px !important;
  max-width: calc(100vw - 28px) !important;
  border-radius: 14px !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25) !important;
  border: 1px solid rgba(0, 136, 206, 0.3) !important;
  background: #ffffff !important;
  overflow: hidden !important;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.chrono-status-widget.is-collapsed {
  width: auto !important;
  max-width: auto !important;
  border-radius: 24px !important;
  background: #0088ce !important;
  border: 1.5px solid #ffffff !important;
  box-shadow: 0 4px 16px rgba(0, 136, 206, 0.4) !important;
  cursor: pointer !important;
}

.chrono-status-widget.is-collapsed .chrono-status-header {
  background: transparent !important;
  border-bottom: none !important;
  padding: 8px 16px !important;
  font-size: 13px !important;
  color: #ffffff !important;
}

.chrono-status-widget.is-collapsed .chrono-status-body {
  display: none !important;
}

/* ==========================================================================
   4. INSCAN MODAL SINGLE-LINE ROW FORMATTING
   ========================================================================== */
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
}

.chrono-cn-code {
  font-weight: 700 !important;
  font-size: 13.5px !important;
  color: #0f172a !important;
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

.chrono-ext-status-timeline.is-single-line {
  display: flex !important;
  flex-direction: column !important;
  width: 100% !important;
  background: #f8fafc !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 6px !important;
  padding: 3px 6px !important;
  box-sizing: border-box !important;
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
"""

js_inject = f"""
(() => {{
  let style = document.getElementById('chrono-comprehensive-responsive');
  if (!style) {{
    style = document.createElement('style');
    style.id = 'chrono-comprehensive-responsive';
    document.head.appendChild(style);
  }}
  style.textContent = `{comprehensive_css}`;
  return "Comprehensive CSS injected successfully";
}})()
"""

print(eval_js(js_inject))
time.sleep(1)

subprocess.run(['adb', 'shell', 'screencap', '-p', '/sdcard/trip_comprehensive.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/trip_comprehensive.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\trip_comprehensive_live.png'], check=True)
print("Captured trip_comprehensive_live.png")

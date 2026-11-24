from cdp_helper import eval_js
import subprocess
import time

test_css = """
/* Responsive cards for Consignment & Trip Details */
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

/* Labels and values readability */
[class*="rowContainer-"] span,
[class*="tabsCardsContainer-"] span {
  font-size: 13px !important;
}

/* Tabs bar responsive and touch scrolling */
.ant-tabs-nav-wrap {
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch !important;
  display: flex !important;
  width: 100% !important;
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
  border-radius: 20px !important;
  white-space: nowrap !important;
}

/* Trip Details action bar & pagination wrapping */
[class*="tabsCardsContainer-"] .ant-tabs-extra-content,
.ant-tabs-top > .ant-tabs-nav .ant-tabs-extra-content {
  margin-left: 0 !important;
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
  width: 100% !important;
  justify-content: flex-start !important;
  padding: 4px 0 !important;
}

/* Floating Status Widget sleek collapsible pill on mobile */
.chrono-status-widget {
  width: auto !important;
  max-width: 92vw !important;
  left: auto !important;
  right: 12px !important;
  bottom: 16px !important;
  border-radius: 14px !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.25) !important;
  border: 1px solid rgba(0, 136, 206, 0.4) !important;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.chrono-status-widget.is-collapsed {
  width: auto !important;
  background: #0088ce !important;
  border-radius: 24px !important;
  padding: 0 !important;
  cursor: pointer !important;
}

.chrono-status-widget.is-collapsed .chrono-status-header {
  background: transparent !important;
  border: none !important;
  padding: 8px 14px !important;
  font-size: 13px !important;
}

.chrono-status-widget.is-collapsed .chrono-status-body {
  display: none !important;
}
"""

js_inject = f"""
(() => {{
  let style = document.getElementById('chrono-test-responsive');
  if (!style) {{
    style = document.createElement('style');
    style.id = 'chrono-test-responsive';
    document.head.appendChild(style);
  }}
  style.textContent = `{test_css}`;
  return "CSS injected";
}})()
"""

print(eval_js(js_inject))
time.sleep(1)

subprocess.run(['adb', 'shell', 'screencap', '-p', '/sdcard/trip_responsive.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/trip_responsive.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\trip_responsive_test.png'], check=True)
print("Screenshot captured")

import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

css_test = """
/* 1. Eliminate 420px dead whitespace */
[class*="tableContainer-"],
[class*="tableContainer-"] > div,
div[style*="min-height: 420px"],
div[style*="min-height: 280px"],
div[class*="compactTable-"],
div[class*="tableParent-"] {
  min-height: 0 !important;
  height: auto !important;
  position: relative !important;
}

/* 2. Prevent horizontal scrolling bounce */
html, body {
  max-width: 100vw !important;
  overflow-x: hidden !important;
}

.ant-tabs-nav-wrap {
  max-width: 100vw !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch !important;
}

/* 3. Centered subtle italic note */
[class*="Component-message-"], [class*="message-"] {
  font-size: 11px !important;
  font-style: italic !important;
  color: #64748b !important;
  text-align: center !important;
  margin: 2px 0 4px 0 !important;
  width: 100% !important;
}

/* 4. Tab 1 Consignment Balance layout */
[class*="Component-tableRow-"],
[class*="tableRow-"] {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  width: 100% !important;
}

[class*="tableRow-"] > .ant-col-8,
[class*="tableRow-"] > div:has(input[placeholder*="Waybill" i]) {
  width: 100% !important;
  max-width: 100% !important;
  flex: 0 0 100% !important;
}

input[placeholder*="Waybill" i] {
  min-height: 44px !important;
  height: 44px !important;
  font-size: 15px !important;
  border-radius: 8px !important;
}

[class*="tableRow-"] > [class*="Component-col-"],
[class*="tableRow-"] > [class*="col-"] {
  flex: 1 1 0 !important;
  width: 48% !important;
  max-width: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #f1f5f9 !important;
  border-radius: 8px !important;
  padding: 8px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

/* Action buttons on Consignment tab */
[class*="settleBalance-"]:has(.chrono-inscan-ext-btn) {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  width: 100% !important;
  margin-top: 6px !important;
}

[class*="settleBalance-"] > button.chrono-inscan-ext-btn {
  width: 100% !important;
  flex: 0 0 100% !important;
  min-height: 44px !important;
  height: 44px !important;
  font-size: 15px !important;
  border-radius: 8px !important;
  margin: 0 !important;
}

[class*="settleBalance-"]:has(.chrono-inscan-ext-btn) > button:not(.chrono-inscan-ext-btn) {
  flex: 1 1 0 !important;
  min-height: 40px !important;
  height: 40px !important;
  border-radius: 8px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
}

[class*="settleBalance-"]:has(.chrono-inscan-ext-btn) > button:has(.anticon-reload) {
  flex: 0 0 44px !important;
  max-width: 44px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* 5. Tab 2 Non-Cash Balance */
[class*="settleBalance-"] > div:has(> .ant-select) {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  width: 100% !important;
  gap: 12px !important;
  padding: 4px 0 !important;
}

[class*="settleBalance-"] > div:has(> .ant-select) > span {
  font-size: 13px !important;
  font-weight: 600 !important;
  color: #1e293b !important;
}

[class*="settleBalance-"] > div:has(> .ant-select) .ant-select {
  flex: 1 1 auto !important;
  min-height: 38px !important;
}

[class*="settleBalance-"]:has(> button.primaryButton-0-3-145) {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  width: 100% !important;
}

[class*="settleBalance-"] > button:has(span:contains("Settle")) {
  width: 100% !important;
  flex: 0 0 100% !important;
  min-height: 44px !important;
  height: 44px !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  border-radius: 8px !important;
}

[class*="settleBalance-"]:has(> button:has(span:contains("Settle"))) > button:not(:has(span:contains("Settle"))) {
  flex: 1 1 0 !important;
  min-height: 38px !important;
  height: 38px !important;
  border-radius: 8px !important;
}
"""

js = f"""
(() => {{
    let s = document.getElementById('test-recon-refinements');
    if (!s) {{
        s = document.createElement('style');
        s.id = 'test-recon-refinements';
        document.head.appendChild(s);
    }}
    s.textContent = `{css_test}`;

    // Remove unwanted toast if visible
    const toast = document.querySelector('.chrono-ext-toast');
    if (toast) toast.remove();

    return "Applied";
}})()
"""

print(eval_js(js))

# Switch to Tab 1 (Consignment Balance) and capture
eval_js("document.querySelectorAll('.ant-tabs-tab')[1].click();")
time.sleep(0.8)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/test_tab1.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/test_tab1.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\test_tab1.png'], check=True)

# Switch to Tab 2 (Non-Cash Balance) and capture
eval_js("document.querySelectorAll('.ant-tabs-tab')[2].click();")
time.sleep(0.8)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/test_tab2.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/test_tab2.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\test_tab2.png'], check=True)

# Switch back to Tab 0 (Cash Balance) and capture
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")
time.sleep(0.8)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/test_tab0.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/test_tab0.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\test_tab0.png'], check=True)

print("Done captures")

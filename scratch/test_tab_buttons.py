import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    let s = document.getElementById('test-button-refinements');
    if (!s) {
        s = document.createElement('style');
        s.id = 'test-button-refinements';
        document.head.appendChild(s);
    }
    s.textContent = `
    /* Consignment Balance Tab Buttons */
    div:has(> .chrono-inscan-ext-btn) {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      width: 100% !important;
      margin-top: 6px !important;
    }
    .chrono-inscan-ext-btn {
      width: 100% !important;
      flex: 0 0 100% !important;
      min-height: 44px !important;
      height: 44px !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      border-radius: 8px !important;
      margin: 0 !important;
    }
    div:has(> .chrono-inscan-ext-btn) > button:not(.chrono-inscan-ext-btn) {
      flex: 1 1 0 !important;
      min-height: 40px !important;
      height: 40px !important;
      border-radius: 8px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
    }
    div:has(> .chrono-inscan-ext-btn) > button:has(.anticon-reload) {
      flex: 0 0 44px !important;
      max-width: 44px !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    /* Non-Cash Balance Tab Buttons */
    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"]:has(button:has(span:contains("Settle"))),
    div:has(> button.primaryButton-0-3-145:has(span:contains("Settle"))) {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      width: 100% !important;
    }
    .ant-tabs-tabpane:nth-child(3) button:has(span:contains("Settle")) {
      width: 100% !important;
      flex: 0 0 100% !important;
      min-height: 44px !important;
      height: 44px !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      border-radius: 8px !important;
    }
    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"] > button:not(:has(span:contains("Settle"))) {
      flex: 1 1 0 !important;
      min-height: 38px !important;
      height: 38px !important;
      border-radius: 8px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    /* Empty table gap fix */
    .ant-table-empty,
    div:has(> .ant-table-empty),
    div:has(> * > .ant-table-empty),
    [class*="tableContainer-"]:has(.ant-table-empty),
    [class*="tableContainer-"] > div:has(.ant-table-empty) {
      min-height: 0 !important;
      height: auto !important;
    }
    `;

    // Add labels to Tab 3 Excel and Reload if missing
    const pane3 = document.querySelectorAll('.ant-tabs-tabpane')[2];
    if (pane3) {
      const downloadBtn = pane3.querySelector('button .anticon-download')?.closest('button');
      if (downloadBtn && !downloadBtn.dataset.chronoLabeled) {
        downloadBtn.dataset.chronoLabeled = 'true';
        const span = document.createElement('span');
        span.textContent = ' Excel';
        downloadBtn.appendChild(span);
      }
      const reloadBtn = pane3.querySelector('button .anticon-reload')?.closest('button');
      if (reloadBtn && !reloadBtn.dataset.chronoLabeled) {
        reloadBtn.dataset.chronoLabeled = 'true';
        const span = document.createElement('span');
        span.textContent = ' Actualiser';
        reloadBtn.appendChild(span);
      }
    }

    return "Refinements applied";
})()
"""

print(eval_js(js))

# Test Tab 1 (Consignment Balance)
eval_js("document.querySelectorAll('.ant-tabs-tab')[1].click();")
time.sleep(0.6)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab1_perfect.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab1_perfect.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab1_perfect.png'], check=True)

# Test Tab 2 (Non-Cash Balance)
eval_js("document.querySelectorAll('.ant-tabs-tab')[2].click();")
time.sleep(0.6)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab2_perfect.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab2_perfect.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab2_perfect.png'], check=True)

# Switch back to Tab 0
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")
time.sleep(0.6)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab0_perfect.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab0_perfect.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab0_perfect.png'], check=True)

print("Screenshots taken.")

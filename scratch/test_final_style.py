import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    // Remove temporary test stylesheets
    ['test-recon-refinements', 'test-button-refinements', 'test-line575-fix', 'chrono-refined-style'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });

    const s = document.createElement('style');
    s.id = 'chrono-final-recon-style';
    s.textContent = `
    /* Exclude settleBalance and tabsCardsContainer from single-row nowrap (line 575 override) */
    [class*="settleBalance-"],
    [class*="Component-settleBalance-"] {
      display: flex !important;
      flex-wrap: wrap !important;
      max-height: none !important;
      height: auto !important;
      overflow: visible !important;
      width: 100% !important;
      gap: 8px !important;
    }

    /* Tab 0 (Cash Balance) */
    .ant-tabs-tabpane:nth-child(1) [class*="settlementContainer-"] > div:nth-child(2) button,
    .chrono-action-btns-row button {
      flex: 1 1 0 !important;
      width: 50% !important;
      min-height: 38px !important;
      height: 38px !important;
      border-radius: 8px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
    }

    /* Tab 1 (Consignment Balance) - Input & Stats */
    [class*="Component-tableRow-"], [class*="tableRow-"] {
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

    /* Tab 1 Buttons */
    .ant-tabs-tabpane:nth-child(2) [class*="settleBalance-"] button.chrono-inscan-ext-btn,
    button.chrono-inscan-ext-btn {
      width: 100% !important;
      flex: 0 0 100% !important;
      min-height: 44px !important;
      height: 44px !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      border-radius: 8px !important;
      margin: 0 0 4px 0 !important;
      order: 1 !important;
    }
    .ant-tabs-tabpane:nth-child(2) [class*="settleBalance-"] button:not(.chrono-inscan-ext-btn):not(:has(.anticon-reload)) {
      flex: 1 1 0 !important;
      min-height: 40px !important;
      height: 40px !important;
      border-radius: 8px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      order: 2 !important;
    }
    .ant-tabs-tabpane:nth-child(2) [class*="settleBalance-"] button:has(.anticon-reload) {
      flex: 0 0 44px !important;
      max-width: 44px !important;
      min-height: 40px !important;
      height: 40px !important;
      border-radius: 8px !important;
      padding: 0 !important;
      order: 3 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    /* Tab 2 (Non-Cash Balance) */
    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"] > div:has(> .ant-select) {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      width: 100% !important;
      gap: 12px !important;
      padding: 4px 0 !important;
    }
    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"] > div:has(> .ant-select) > span {
      font-size: 13px !important;
      font-weight: 600 !important;
      color: #1e293b !important;
    }
    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"] > div:has(> .ant-select) .ant-select {
      flex: 1 1 auto !important;
      min-height: 38px !important;
    }
    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"] button:has(span:contains("Settle")),
    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"] button.primaryButton-0-3-145:first-child {
      width: 100% !important;
      flex: 0 0 100% !important;
      min-height: 44px !important;
      height: 44px !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      border-radius: 8px !important;
      margin: 0 0 4px 0 !important;
      order: 1 !important;
    }
    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"] button:not(:first-child) {
      flex: 1 1 0 !important;
      width: 50% !important;
      min-height: 38px !important;
      height: 38px !important;
      border-radius: 8px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      order: 2 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
    }

    /* Universal Table Empty & Min-height overrides */
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

    /* Horizontal scroll fix */
    html, body {
      max-width: 100vw !important;
      overflow-x: hidden !important;
    }
    .ant-tabs-nav-wrap {
      max-width: 100vw !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
    }
    `;
    document.head.appendChild(s);

    // Ensure labels on Tab 2 Excel and Actualiser
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

    // Remove false toast if present
    const toast = document.querySelector('.chrono-ext-toast');
    if (toast) toast.remove();

    return "Final test style applied";
})()
"""

print(eval_js(js))

# Test Tab 1 (Consignment Balance)
eval_js("document.querySelectorAll('.ant-tabs-tab')[1].click();")
time.sleep(0.7)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab1_final_check.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab1_final_check.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab1_final_check.png'], check=True)

# Test Tab 2 (Non-Cash Balance)
eval_js("document.querySelectorAll('.ant-tabs-tab')[2].click();")
time.sleep(0.7)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab2_final_check.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab2_final_check.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab2_final_check.png'], check=True)

# Test Tab 0 (Cash Balance)
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")
time.sleep(0.7)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab0_final_check.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab0_final_check.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab0_final_check.png'], check=True)

print("All final captures taken.")

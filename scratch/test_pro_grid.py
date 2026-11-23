import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    let s = document.getElementById('test-pro-grid');
    if (!s) {
        s = document.createElement('style');
        s.id = 'test-pro-grid';
        document.head.appendChild(s);
    }
    s.textContent = `
    /* Tab 1 (Consignment Balance) Grid */
    .ant-tabs-tabpane:nth-child(2) [class*="settlementContainer-"] > [class*="settleBalance-"]:last-child {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      width: 100% !important;
    }
    .ant-tabs-tabpane:nth-child(2) [class*="settlementContainer-"] > [class*="settleBalance-"]:last-child > button.chrono-inscan-ext-btn {
      flex: 1 1 calc(100% - 52px) !important;
      width: calc(100% - 52px) !important;
      min-height: 44px !important;
      height: 44px !important;
      margin: 0 !important;
      order: 1 !important;
    }
    .ant-tabs-tabpane:nth-child(2) [class*="settlementContainer-"] > [class*="settleBalance-"]:last-child > button:has(.anticon-reload) {
      flex: 0 0 44px !important;
      width: 44px !important;
      min-height: 44px !important;
      height: 44px !important;
      padding: 0 !important;
      margin: 0 !important;
      order: 2 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    .ant-tabs-tabpane:nth-child(2) [class*="settlementContainer-"] > [class*="settleBalance-"]:last-child > button:not(.chrono-inscan-ext-btn):not(:has(.anticon-reload)) {
      flex: 1 1 calc(50% - 4px) !important;
      width: calc(50% - 4px) !important;
      min-height: 40px !important;
      height: 40px !important;
      margin: 0 !important;
      order: 3 !important;
    }

    /* Tab 2 (Non-Cash Balance) Grid */
    .ant-tabs-tabpane:nth-child(3) [class*="settlementContainer-"] > [class*="settleBalance-"]:last-child {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      width: 100% !important;
    }
    .ant-tabs-tabpane:nth-child(3) [class*="settlementContainer-"] > [class*="settleBalance-"]:last-child > button.chrono-settle-btn,
    .ant-tabs-tabpane:nth-child(3) [class*="settlementContainer-"] > [class*="settleBalance-"]:last-child > button.primaryButton-0-3-145:first-child {
      flex: 0 0 100% !important;
      width: 100% !important;
      min-height: 44px !important;
      height: 44px !important;
      margin: 0 !important;
      order: 1 !important;
    }
    .ant-tabs-tabpane:nth-child(3) [class*="settlementContainer-"] > [class*="settleBalance-"]:last-child > button:not(.chrono-settle-btn):not(.primaryButton-0-3-145:first-child) {
      flex: 1 1 calc(50% - 4px) !important;
      width: calc(50% - 4px) !important;
      min-height: 38px !important;
      height: 38px !important;
      margin: 0 !important;
      order: 2 !important;
    }
    `;
    return "Pro grid applied";
})()
"""

print(eval_js(js))

# Switch to Tab 1 and capture
eval_js("document.querySelectorAll('.ant-tabs-tab')[1].click();")
time.sleep(0.6)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/pro_tab1.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/pro_tab1.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\pro_tab1.png'], check=True)

# Switch to Tab 2 and capture
eval_js("document.querySelectorAll('.ant-tabs-tab')[2].click();")
time.sleep(0.6)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/pro_tab2.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/pro_tab2.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\pro_tab2.png'], check=True)

# Switch back to Tab 0
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")

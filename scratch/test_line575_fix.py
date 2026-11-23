import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    let s = document.getElementById('test-line575-fix');
    if (!s) {
        s = document.createElement('style');
        s.id = 'test-line575-fix';
        document.head.appendChild(s);
    }
    s.textContent = `
    /* Exclude settleBalance and tabsCardsContainer completely from single-row nowrap */
    [class*="settleBalance-"] {
      display: flex !important;
      flex-wrap: wrap !important;
      max-height: none !important;
      height: auto !important;
      overflow: visible !important;
      width: 100% !important;
      gap: 8px !important;
    }

    /* Tab 1 Consignment Balance buttons */
    [class*="settleBalance-"] > button.chrono-inscan-ext-btn {
      width: 100% !important;
      flex: 0 0 100% !important;
      min-height: 44px !important;
      height: 44px !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      border-radius: 8px !important;
      margin: 0 !important;
      order: 1 !important;
    }

    [class*="settleBalance-"]:has(.chrono-inscan-ext-btn) > button:not(.chrono-inscan-ext-btn) {
      flex: 1 1 0 !important;
      min-height: 40px !important;
      height: 40px !important;
      border-radius: 8px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      order: 2 !important;
    }

    [class*="settleBalance-"]:has(.chrono-inscan-ext-btn) > button:has(.anticon-reload) {
      flex: 0 0 44px !important;
      max-width: 44px !important;
      padding: 0 !important;
      order: 3 !important;
    }

    /* Tab 2 Non-Cash buttons */
    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"] > button:has(span:contains("Settle")),
    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"] > button.primaryButton-0-3-145:first-child {
      width: 100% !important;
      flex: 0 0 100% !important;
      min-height: 44px !important;
      height: 44px !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      border-radius: 8px !important;
      order: 1 !important;
      margin: 0 0 4px 0 !important;
    }

    .ant-tabs-tabpane:nth-child(3) [class*="settleBalance-"] > button:not(:first-child) {
      flex: 1 1 0 !important;
      min-height: 38px !important;
      height: 38px !important;
      border-radius: 8px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      order: 2 !important;
    }
    `;

    return "Line 575 fix applied";
})()
"""

print(eval_js(js))

# Test Tab 1
eval_js("document.querySelectorAll('.ant-tabs-tab')[1].click();")
time.sleep(0.6)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab1_fixed.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab1_fixed.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab1_fixed.png'], check=True)

# Test Tab 2
eval_js("document.querySelectorAll('.ant-tabs-tab')[2].click();")
time.sleep(0.6)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab2_fixed.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab2_fixed.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab2_fixed.png'], check=True)

# Test Tab 0
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")
time.sleep(0.6)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab0_fixed.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab0_fixed.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab0_fixed.png'], check=True)

print("Captures complete.")

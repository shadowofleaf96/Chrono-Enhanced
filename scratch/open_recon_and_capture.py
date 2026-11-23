import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

# 1. Navigate to rider list
print("Navigating to /ops/reconciliation/rider-list...")
eval_js("location.href = '/ops/reconciliation/rider-list'")
time.sleep(3)

# 2. Wait for riders table and find Reconcile button
for i in range(15):
    btn_found = eval_js("""
    (() => {
        const closeBtn = document.querySelector('.chrono-ext-month-modal-close');
        if (closeBtn) closeBtn.click();
        const recBtn = Array.from(document.querySelectorAll('tbody tr button, tbody tr a')).find(el => (el.textContent || '').trim().toLowerCase() === 'reconcile');
        if (recBtn) {
            recBtn.click();
            return true;
        }
        return false;
    })()
    """)
    if btn_found:
        print("Clicked Reconcile button on rider!")
        break
    time.sleep(1)

# 3. Wait for recon tabs to load
print("Waiting for recon tabs...")
for i in range(15):
    tab_count = eval_js("document.querySelectorAll('.ant-tabs-tab').length")
    if tab_count and tab_count >= 3:
        print(f"Tabs loaded! count = {tab_count}")
        break
    time.sleep(1)

time.sleep(1.5)

# Tab 0: Cash Balance
print("Capturing Tab 0 (Cash Balance)...")
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")
time.sleep(1)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/pure_tab0.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/pure_tab0.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\pure_tab0.png'], check=True)

# Tab 1: Consignment Balance
print("Capturing Tab 1 (Consignment Balance)...")
eval_js("document.querySelectorAll('.ant-tabs-tab')[1].click();")
time.sleep(1)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/pure_tab1.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/pure_tab1.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\pure_tab1.png'], check=True)

# Tab 2: Non-Cash Balance
print("Capturing Tab 2 (Non-Cash Balance)...")
eval_js("document.querySelectorAll('.ant-tabs-tab')[2].click();")
time.sleep(1)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/pure_tab2.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/pure_tab2.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\pure_tab2.png'], check=True)

# Return to Tab 0
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")
print("Done!")

import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

# Check current page
url = eval_js('location.href')
print("Current URL:", url)

target_url = "https://cross.chronodiali.ma/ops/reconciliation/recon/AHA01"
if not url or '/ops/reconciliation/recon/' not in url:
    print("Navigating to target URL...")
    eval_js(f"location.href = '{target_url}'")
    time.sleep(4)

# Wait until tab headers are present
for attempt in range(15):
    res = eval_js("document.querySelectorAll('.ant-tabs-tab').length")
    print(f"Attempt {attempt}: tabs found = {res}")
    if res and res >= 3:
        break
    time.sleep(1)

# Tab 0: Cash Balance
print("Capturing Tab 0 (Cash Balance)...")
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")
time.sleep(1.2)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/pure_tab0.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/pure_tab0.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\pure_tab0.png'], check=True)

# Tab 1: Consignment Balance
print("Capturing Tab 1 (Consignment Balance)...")
eval_js("document.querySelectorAll('.ant-tabs-tab')[1].click();")
time.sleep(1.2)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/pure_tab1.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/pure_tab1.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\pure_tab1.png'], check=True)

# Tab 2: Non-Cash Balance
print("Capturing Tab 2 (Non-Cash Balance)...")
eval_js("document.querySelectorAll('.ant-tabs-tab')[2].click();")
time.sleep(1.2)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/pure_tab2.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/pure_tab2.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\pure_tab2.png'], check=True)

# Return to Tab 0
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")
print("All pure captures completed successfully.")

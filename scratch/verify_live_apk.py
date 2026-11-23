import subprocess
import time
import json
import sys
sys.path.insert(0, 'scratch')

# Launch app
subprocess.run(['adb', 'shell', 'monkey -p com.chrono.mohammedia -c android.intent.category.LAUNCHER 1'], check=True)
time.sleep(3)

from cdp_helper import eval_js

# Check current page URL
url = eval_js('location.href')
print("Current URL:", url)

# If not on reconciliation page, navigate there
if '/ops/reconciliation/recon/' not in url:
    print("Navigating to /ops/reconciliation/recon/AHA01")
    eval_js("location.href = '/ops/reconciliation/recon/AHA01'")
    time.sleep(3)

# Tab 0: Cash Balance
print("Tab 0 (Cash Balance)...")
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")
time.sleep(1)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/live_tab0.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/live_tab0.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\live_tab0.png'], check=True)

# Tab 1: Consignment Balance
print("Tab 1 (Consignment Balance)...")
eval_js("document.querySelectorAll('.ant-tabs-tab')[1].click();")
time.sleep(1)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/live_tab1.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/live_tab1.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\live_tab1.png'], check=True)

# Tab 2: Non-Cash Balance
print("Tab 2 (Non-Cash Balance)...")
eval_js("document.querySelectorAll('.ant-tabs-tab')[2].click();")
time.sleep(1)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/live_tab2.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/live_tab2.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\live_tab2.png'], check=True)

# Return to Tab 0
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")

print("All live screenshots captured successfully.")

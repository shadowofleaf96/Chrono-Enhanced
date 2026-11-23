import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

# Switch to Tab 0
eval_js("document.querySelectorAll('.ant-tabs-tab')[0].click();")
time.sleep(0.5)

# Scroll to bottom
eval_js("window.scrollTo(0, document.body.scrollHeight);")
time.sleep(0.5)

subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab0_scrolled.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab0_scrolled.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab0_scrolled.png'], check=True)

eval_js("window.scrollTo(0, 0);")
print("Captured tab0_scrolled")

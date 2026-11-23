import sys
import time
import subprocess
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

# Switch to Tab 1
eval_js('document.querySelectorAll(".ant-tabs-tab")[1].click();')
time.sleep(1)

res = eval_js('''
(() => {
    const inscan = document.querySelector('.chrono-inscan-ext-btn');
    return {
        found: !!inscan,
        text: inscan ? inscan.innerText : null
    };
})()
''')
print("Tab 1 inscan btn:", res)

# Click Inscan
res2 = eval_js('''
(() => {
    const inscan = document.querySelector('.chrono-inscan-ext-btn');
    if (inscan) {
        inscan.click();
        return 'inscan clicked';
    }
    return 'inscan not found';
})()
''')
print("Click:", res2)
time.sleep(1.5)

subprocess.run(['adb', 'shell', 'screencap -p /sdcard/cycle_opened.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/cycle_opened.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\cycle_opened.png'], check=True)

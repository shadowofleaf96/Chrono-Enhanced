import sys
import time
import subprocess
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

# Click the close button inside the modal
res = eval_js("""
(() => {
    const iframe = document.querySelector('#chrono-inscan-iframe');
    const idoc = iframe?.contentDocument;
    const closeBtn = idoc?.querySelector('.ant-modal-close');
    if (closeBtn) {
        closeBtn.click();
        return 'clicked close button';
    }
    return 'close button not found';
})()
""")
print('Close click:', res)
time.sleep(1)

subprocess.run(['adb', 'shell', 'screencap -p /sdcard/now_closed.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/now_closed.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\now_closed.png'], check=True)

after_close = eval_js("""
(() => {
    const overlay = document.querySelector('.chrono-iframe-overlay');
    const activeTab = Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]')).find(t => t.classList.contains('ant-tabs-tab-active'))?.innerText?.trim();
    return {
        overlayOpacity: overlay?.style?.opacity,
        overlayPointerEvents: overlay?.style?.pointerEvents,
        activeTab: activeTab,
        hasInscanBtn: !!document.querySelector('.chrono-inscan-ext-btn')
    };
})()
""")
print('After close check:', json.dumps(after_close, indent=2))

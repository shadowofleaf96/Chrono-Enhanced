import sys
import time
import subprocess
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

# 1. Reload page to ensure fresh assets are injected
print("1. Reloading page...")
eval_js("window.location.reload()")
time.sleep(3)

# 2. Wait for tabs
for i in range(10):
    tab_count = eval_js("document.querySelectorAll('.ant-tabs-tab').length")
    if tab_count and tab_count >= 3:
        print(f"Tabs loaded: {tab_count}")
        break
    time.sleep(1)

# 3. Switch to Tab 1 (Consignment Balance)
tab_res = eval_js("""
(() => {
    const tabs = Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]'));
    const tab1 = tabs.find(t => (t.innerText || '').toLowerCase().includes('consignment')) || tabs[1];
    if (tab1) {
        tab1.click();
        return { clicked: true, tab: tab1.innerText.trim() };
    }
    return { error: 'Tab 1 not found' };
})()
""")
print("2. Tab switch to Consignment Balance:", tab_res)
time.sleep(1.5)

# 4. Click Inscan button
inscan_res = eval_js("""
(() => {
    const btn = document.querySelector('.chrono-inscan-ext-btn');
    if (btn) {
        btn.click();
        return { clicked: true, text: btn.innerText.trim() };
    }
    return { error: 'Inscan button not found' };
})()
""")
print("3. Inscan button click:", inscan_res)

# 5. Wait for modal to open
for i in range(12):
    time.sleep(1)
    status = eval_js("""
    (() => {
        const overlay = document.querySelector('.chrono-iframe-overlay');
        const iframe = document.querySelector('#chrono-inscan-iframe');
        const idoc = iframe?.contentDocument;
        const modal = idoc?.querySelector('.ant-modal-content');
        return {
            overlayOpacity: overlay ? window.getComputedStyle(overlay).opacity : null,
            modalFound: !!modal,
            title: idoc?.querySelector('.ant-modal-title')?.innerText?.trim()
        };
    })()
    """)
    if status and status.get('modalFound') and status.get('overlayOpacity') == '1':
        print(f"   Modal open! ({status.get('title')})")
        break

# 6. Click Close (X) button inside the modal
close_res = eval_js("""
(() => {
    const iframe = document.querySelector('#chrono-inscan-iframe');
    const idoc = iframe?.contentDocument;
    const closeBtn = idoc?.querySelector('.ant-modal-close');
    if (closeBtn) {
        closeBtn.click();
        return 'clicked close';
    }
    return 'no close btn';
})()
""")
print("4. Close click:", close_res)

# Wait 2 seconds for reload and tab restoration
time.sleep(2)

active_tab = eval_js("""
(() => {
    return Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]')).find(t => t.classList.contains('ant-tabs-tab-active'))?.innerText?.trim();
})()
""")
print("5. Active tab after reload:", active_tab)

subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab_restored_clean.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab_restored_clean.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab_restored_clean.png'], check=True)
print("6. Captured tab_restored_clean.png")

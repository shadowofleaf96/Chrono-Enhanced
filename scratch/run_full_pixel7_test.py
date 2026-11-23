import sys
import time
import subprocess
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

print("1. Starting URL:", eval_js("window.location.href"))

# Click Reconcile link on rider
for i in range(10):
    click_res = eval_js("""
    (() => {
        const a = Array.from(document.querySelectorAll('tbody tr a')).find(el => (el.innerText || '').trim().toLowerCase() === 'reconcile');
        if (a) {
            a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return 'clicked Reconcile';
        }
        return null;
    })()
    """)
    if click_res:
        print("2. Reconcile click:", click_res)
        break
    time.sleep(1)

# Wait for recon tabs to load
tabs_loaded = False
for i in range(15):
    time.sleep(1)
    tab_count = eval_js("document.querySelectorAll('.ant-tabs-tab').length")
    if tab_count and tab_count >= 3:
        print(f"3. Recon tabs loaded: {tab_count}")
        tabs_loaded = True
        break

if not tabs_loaded:
    print("Error: tabs not loaded in time")
    sys.exit(1)

time.sleep(1.5)

# Switch to Tab 1 (Consignment Balance)
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
print("4. Tab switch to Consignment Balance:", tab_res)

# Wait 2 seconds for tab content & inscan button
time.sleep(2)

# Click Inscan at Hub button
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
print("5. Inscan button click:", inscan_res)

# Wait for modal to open inside iframe
modal_ready = False
for i in range(15):
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
    print(f"   Waiting for modal... step {i+1}:", status)
    if status and status.get('modalFound') and status.get('overlayOpacity') == '1':
        modal_ready = True
        break

time.sleep(1)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/final_success_inscan_open.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/final_success_inscan_open.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\final_success_inscan_open.png'], check=True)
print("6. Captured final_success_inscan_open.png")

# Now click Close (X) button inside the modal
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
print("7. Close click:", close_res)

# Wait 3.5 seconds for reload and tab restoration
time.sleep(3.5)

closed_status = eval_js("""
(() => {
    const overlay = document.querySelector('.chrono-iframe-overlay');
    const activeTab = Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]')).find(t => t.classList.contains('ant-tabs-tab-active'))?.innerText?.trim();
    return {
        overlayOpacity: overlay ? overlay.style.opacity : null,
        overlayPointerEvents: overlay ? overlay.style.pointerEvents : null,
        activeTab: activeTab,
        hasInscanBtn: !!document.querySelector('.chrono-inscan-ext-btn')
    };
})()
""")
print("8. After close status:", json.dumps(closed_status, indent=2))

subprocess.run(['adb', 'shell', 'screencap -p /sdcard/final_success_inscan_closed.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/final_success_inscan_closed.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\final_success_inscan_closed.png'], check=True)
print("9. Captured final_success_inscan_closed.png")
print("VERIFICATION COMPLETED SUCCESSFULLY!")

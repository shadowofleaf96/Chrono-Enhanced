import sys
import time
import subprocess
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

print("1. Current URL:", eval_js("window.location.href"))

# Click Reconcile on first row
recon_res = eval_js("""
(() => {
    const link = Array.from(document.querySelectorAll('a, button')).find(el => {
        const t = el.innerText.trim().toLowerCase();
        return t === 'reconcile' || t === 'réconcilier' || t === 'reconcilier';
    });
    if (link) {
        link.click();
        return { clicked: true, text: link.innerText };
    }
    return { error: 'Reconcile link not found' };
})()
""")
print("2. Reconcile click:", recon_res)

# Wait 3 seconds for reconciliation page to load
time.sleep(3)
print("3. Recon URL:", eval_js("window.location.href"))

# Switch to Tab 1 (Consignment Balance)
tab_res = eval_js("""
(() => {
    const tabs = Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]'));
    const tab1 = tabs.find(t => t.innerText.toLowerCase().includes('consignment'));
    if (tab1) {
        tab1.click();
        return { clicked: true, tab: tab1.innerText.trim() };
    }
    if (tabs.length > 1) {
        tabs[1].click();
        return { clicked: true, tab: tabs[1].innerText.trim() };
    }
    return { error: 'Tab 1 not found' };
})()
""")
print("4. Tab switch:", tab_res)

# Wait 1.5 seconds for tab contents & button injection
time.sleep(1.5)

# Find and click Inscan at Hub button
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

# Wait 4 seconds for iframe preload and modal opening
time.sleep(4)

# Inspect modal state inside iframe
modal_info = eval_js("""
(() => {
    const overlay = document.querySelector('.chrono-iframe-overlay');
    const iframe = document.querySelector('#chrono-inscan-iframe');
    const idoc = iframe ? iframe.contentDocument : null;
    const modal = idoc ? idoc.querySelector('.ant-modal-content') : null;
    
    return {
        overlayFound: !!overlay,
        overlayOpacity: overlay ? window.getComputedStyle(overlay).opacity : null,
        overlayDisplay: overlay ? window.getComputedStyle(overlay).display : null,
        overlayZIndex: overlay ? window.getComputedStyle(overlay).zIndex : null,
        modalFound: !!modal,
        modalTitle: idoc?.querySelector('.ant-modal-title')?.innerText?.trim(),
        modalInput: idoc?.querySelector('input[placeholder*="consignments" i]')?.placeholder,
        modalButtons: idoc ? Array.from(idoc.querySelectorAll('.ant-modal button')).map(b => b.innerText.trim()).filter(Boolean) : []
    };
})()
""")
print("6. Modal info:", json.dumps(modal_info, indent=2))

# Take screenshot of open modal
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/final_inscan_modal_open.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/final_inscan_modal_open.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\final_inscan_modal_open.png'], check=True)

# Now test closing modal (click X close button)
close_res = eval_js("""
(() => {
    const iframe = document.querySelector('#chrono-inscan-iframe');
    const idoc = iframe ? iframe.contentDocument : null;
    const closeBtn = idoc ? idoc.querySelector('.ant-modal-close') : null;
    if (closeBtn) {
        closeBtn.click();
        return 'clicked close button';
    }
    return 'close button not found';
})()
""")
print("7. Close click:", close_res)

time.sleep(1.5)

# Check overlay state after close
after_close_info = eval_js("""
(() => {
    const overlay = document.querySelector('.chrono-iframe-overlay');
    return {
        overlayOpacity: overlay ? overlay.style.opacity : null,
        overlayPointerEvents: overlay ? overlay.style.pointerEvents : null,
        activeTab: Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]')).find(t => t.classList.contains('ant-tabs-tab-active'))?.innerText?.trim()
    };
})()
""")
print("8. After close info:", json.dumps(after_close_info, indent=2))

# Take screenshot after close
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/final_inscan_closed.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/final_inscan_closed.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\final_inscan_closed.png'], check=True)
print("Finished flow test!")

import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

def switch_to_tab(tab_index):
    code = f"""
    (() => {{
        const tabs = document.querySelectorAll('.ant-tabs-tab');
        if (tabs[{tab_index}]) {{
            tabs[{tab_index}].click();
            return tabs[{tab_index}].innerText.trim();
        }}
        return null;
    }})()
    """
    return eval_js(code)

print("Current active tab: ", switch_to_tab(0))
time.sleep(0.5)

# Click Tab 1 (Consignment Balance)
print("Switching to tab 1 (Consignment):", switch_to_tab(1))
time.sleep(1)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab1_consignment.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab1_consignment.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab1_consignment.png'], check=True)

# Inspect tab 1 DOM
tab1_info = eval_js("""
(() => {
    const pane = document.querySelector('.ant-tabs-tabpane:not(.ant-tabs-tabpane-hidden)');
    if (!pane) return "no pane";
    const inputs = Array.from(pane.querySelectorAll('input')).map(i => ({
        placeholder: i.placeholder,
        width: i.getBoundingClientRect().width,
        height: i.getBoundingClientRect().height
    }));
    const buttons = Array.from(pane.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim(),
        width: b.getBoundingClientRect().width,
        height: b.getBoundingClientRect().height
    }));
    return { inputs, buttons };
})()
""")
print("Tab 1 info:", tab1_info)

# Click Tab 2 (Non-Cash Balance)
print("Switching to tab 2 (Non-Cash):", switch_to_tab(2))
time.sleep(1)
subprocess.run(['adb', 'shell', 'screencap -p /sdcard/tab2_noncash.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/tab2_noncash.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\tab2_noncash.png'], check=True)

# Inspect tab 2 DOM
tab2_info = eval_js("""
(() => {
    const pane = document.querySelector('.ant-tabs-tabpane:not(.ant-tabs-tabpane-hidden)');
    if (!pane) return "no pane";
    const selects = Array.from(pane.querySelectorAll('.ant-select')).map(s => ({
        width: s.getBoundingClientRect().width,
        height: s.getBoundingClientRect().height
    }));
    const buttons = Array.from(pane.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim(),
        width: b.getBoundingClientRect().width,
        height: b.getBoundingClientRect().height
    }));
    return { selects, buttons };
})()
""")
print("Tab 2 info:", tab2_info)

# Switch back to Tab 0 (Cash Balance)
print("Switching back to Tab 0:", switch_to_tab(0))

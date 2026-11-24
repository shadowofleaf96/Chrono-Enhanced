from cdp_helper import eval_js
import json
import subprocess
import time

js = """
(() => {
    const tabs = Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]'));
    const consTab = tabs.find(t => t.innerText.trim().toLowerCase() === 'consignments');
    if (consTab) {
        consTab.click();
        return "Clicked Consignments tab";
    }
    return "Consignments tab not found";
})()
"""

print(eval_js(js))
time.sleep(1)

js_cols = """
(() => {
    const table = document.querySelector('.ant-table');
    if (!table) return "No table";
    const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.replace(/\\n/g, ' '));
    const firstRow = Array.from(table.querySelectorAll('tbody tr:first-child td')).map(td => td.innerText.replace(/\\n/g, ' '));
    return {
        headers: headers,
        firstRow: firstRow
    };
})()
"""

print(json.dumps(eval_js(js_cols), indent=2))

subprocess.run(['adb', 'shell', 'screencap', '-p', '/sdcard/trip_cons_tab.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/trip_cons_tab.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\trip_cons_tab_live.png'], check=True)
print("Captured trip_cons_tab_live.png")

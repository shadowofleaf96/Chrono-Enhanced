from cdp_helper import eval_js
import subprocess
import time

js_expand = """
(() => {
    const pill = document.querySelector('.chrono-status-widget');
    if (!pill) return "No widget";
    pill.click();
    return "Clicked widget to expand";
})()
"""

print(eval_js(js_expand))
time.sleep(1)

subprocess.run(['adb', 'shell', 'screencap', '-p', '/sdcard/widget_expanded.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/widget_expanded.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\widget_expanded_live.png'], check=True)
print("Captured widget_expanded_live.png")

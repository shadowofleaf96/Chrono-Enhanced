from cdp_helper import eval_js
import subprocess
import time

js_nav = """
(() => {
    window.location.href = '/ops/details/MRJN0035983081A';
    return "Navigating to consignment details";
})()
"""

print(eval_js(js_nav))
time.sleep(3)

# Re-inject our responsive CSS
with open('scratch/test_comprehensive.py') as f:
    pass

subprocess.run(['python', 'scratch/test_comprehensive.py'], check=True)
subprocess.run(['python', 'scratch/test_grid.py'], check=True)

time.sleep(1)
subprocess.run(['adb', 'shell', 'screencap', '-p', '/sdcard/cn_details_responsive.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/cn_details_responsive.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\cn_details_responsive_live.png'], check=True)
print("Captured cn_details_responsive_live.png")

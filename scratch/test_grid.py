from cdp_helper import eval_js
import subprocess
import time

css = """
[class*="itemsWrapper-"] {
  display: grid !important;
  grid-template-columns: repeat(2, 1fr) !important;
  gap: 8px !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

[class*="itemsWrapper-"] > [class*="item-"] {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  padding: 6px 10px !important;
  background: #f8fafc !important;
  border-radius: 8px !important;
  border: 1px solid #e2e8f0 !important;
  margin: 0 !important;
}

[class*="itemsWrapper-"] > [class*="item-"] span:first-child,
[class*="itemsWrapper-"] > [class*="item-"] div:first-child {
  font-size: 11px !important;
  color: #64748b !important;
  font-weight: 500 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.3px !important;
}

[class*="itemsWrapper-"] > [class*="item-"] span:last-child,
[class*="itemsWrapper-"] > [class*="item-"] div:last-child {
  font-size: 13px !important;
  color: #0f172a !important;
  font-weight: 700 !important;
}
"""

js = f"""
(() => {{
  let style = document.getElementById('chrono-comprehensive-responsive');
  if (style) style.textContent += `{css}`;
  return "Updated grid CSS";
}})()
"""

print(eval_js(js))
time.sleep(1)

subprocess.run(['adb', 'shell', 'screencap', '-p', '/sdcard/trip_grid.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/trip_grid.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\trip_grid_live.png'], check=True)
print("Captured trip_grid_live.png")

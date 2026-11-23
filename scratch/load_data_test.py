import subprocess, json, urllib.request, websocket, time

adb = r"C:\Users\simok\AppData\Local\Android\Sdk\platform-tools\adb.exe"
pid = subprocess.check_output([adb, 'shell', 'pidof', 'com.chrono.mohammedia']).decode().strip()
subprocess.run(f'"{adb}" forward tcp:9226 localabstract:webview_devtools_remote_{pid}', shell=True)
res = urllib.request.urlopen('http://127.0.0.1:9226/json', timeout=5).read()
tabs = json.loads(res.decode())
ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'], suppress_origin=True)

def eval_js(expr):
    msg_id = int(time.time() * 1000) % 100000
    ws.send(json.dumps({'id': msg_id, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
    return json.loads(ws.recv()).get('result', {}).get('result', {}).get('value')

print("Navigating to /ops/consignments...")
eval_js("window.location.href = '/ops/consignments'")
time.sleep(6)

# Set date range or click date preset "Last 30 days"
date_js = """(() => {
    // Look for date picker in navbar
    const dateInput = document.querySelector('.ant-picker-range, [class*="navbarDateFilter"] .ant-picker, input[placeholder*="Start"]');
    if (dateInput) {
        dateInput.click();
        return 'clicked picker';
    }
    return 'no picker';
})()"""
print("Picker click:", eval_js(date_js))
time.sleep(1)

# Select preset if dropdown opened
preset_js = """(() => {
    const presets = Array.from(document.querySelectorAll('.ant-picker-presets li, .ant-picker-ranges li, span, div')).filter(el => {
        const t = (el.innerText || '').trim();
        return t === 'Yesterday' || t === 'Last 7 days' || t === 'Last 30 days';
    });
    if (presets.length > 0) {
        presets[0].click();
        return 'clicked preset: ' + presets[0].innerText;
    }
    return 'no preset found';
})()"""
print("Preset click:", eval_js(preset_js))
time.sleep(5)

subprocess.run([adb, "shell", "screencap", "-p", "/sdcard/cons_with_data.png"])
subprocess.run([adb, "pull", "/sdcard/cons_with_data.png", "consignments_with_data.png"])
print("Saved consignments_with_data.png")

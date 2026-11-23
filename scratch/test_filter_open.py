import subprocess, json, urllib.request, websocket, time

adb = r"C:\Users\simok\AppData\Local\Android\Sdk\platform-tools\adb.exe"
pid = subprocess.check_output([adb, 'shell', 'pidof', 'com.chrono.mohammedia']).decode().strip()
subprocess.run(f'"{adb}" forward tcp:9225 localabstract:webview_devtools_remote_{pid}', shell=True)
res = urllib.request.urlopen('http://127.0.0.1:9225/json', timeout=5).read()
tabs = json.loads(res.decode())
ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'], suppress_origin=True)

def eval_js(expr):
    ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
    return json.loads(ws.recv()).get('result', {}).get('result', {}).get('value')

print("Clicking filter button...")
eval_js("document.getElementById('chrono-filter-toggle-btn').click()")
time.sleep(1)

subprocess.run([adb, "shell", "screencap", "-p", "/sdcard/cons_filter_open.png"])
subprocess.run([adb, "pull", "/sdcard/cons_filter_open.png", "consignments_filter_open.png"])
print("Pulled consignments_filter_open.png")

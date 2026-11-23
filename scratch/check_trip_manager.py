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

print("Navigating to /ops/retail/trip-manager...")
eval_js("window.location.href = '/ops/retail/trip-manager'")
time.sleep(6)
print("Current URL:", eval_js("window.location.href"))

subprocess.run([adb, "shell", "screencap", "-p", "/sdcard/trip_mgr.png"])
subprocess.run([adb, "pull", "/sdcard/trip_mgr.png", "trip_manager_now.png"])
print("Saved trip_manager_now.png")

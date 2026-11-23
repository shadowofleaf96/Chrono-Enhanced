import subprocess, json, urllib.request, websocket, time

adb = r"C:\Users\simok\AppData\Local\Android\Sdk\platform-tools\adb.exe"
pid = subprocess.check_output([adb, 'shell', 'pidof', 'com.chrono.mohammedia']).decode().strip()
print("Connecting to PID:", pid)
subprocess.run(f'"{adb}" forward tcp:9226 localabstract:webview_devtools_remote_{pid}', shell=True)
time.sleep(0.5)

res = urllib.request.urlopen('http://127.0.0.1:9226/json', timeout=5).read()
tabs = json.loads(res.decode())
ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'], suppress_origin=True)

def eval_js(expr):
    msg_id = int(time.time() * 1000) % 100000
    ws.send(json.dumps({'id': msg_id, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
    resp = json.loads(ws.recv())
    return resp.get('result', {}).get('result', {}).get('value')

pages = [
    ("/ops/consignments", "installed_consignments_clean.png"),
    ("/ops/retail/trip-manager", "installed_trip_manager_clean.png"),
    ("/ops/reconciliation/rider-list", "installed_rider_list_clean.png")
]

for url, filename in pages:
    print(f"Navigating to {url}...")
    eval_js(f"window.location.href = '{url}'")
    time.sleep(7)
    current = eval_js("window.location.href")
    print(f"Loaded: {current}")
    remote_path = f"/sdcard/{filename}"
    subprocess.run([adb, "shell", "screencap", "-p", remote_path])
    subprocess.run([adb, "pull", remote_path, filename])
    print(f"Saved {filename}")

ws.close()
print("All pages verified successfully!")

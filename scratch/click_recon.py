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

print("Clicking first Reconcile button...")
eval_js("""(() => {
    const buttons = Array.from(document.querySelectorAll('a, button, span')).filter(el => (el.innerText || '').trim() === 'Reconcile');
    if (buttons.length > 0) {
        buttons[0].click();
        return 'clicked';
    }
    return 'none';
})()""")

time.sleep(3)
print("Current URL:", eval_js("window.location.href"))

subprocess.run([adb, "shell", "screencap", "-p", "/sdcard/recon_detail_now.png"])
subprocess.run([adb, "pull", "/sdcard/recon_detail_now.png", "recon_detail_verified.png"])
print("Saved recon_detail_verified.png")

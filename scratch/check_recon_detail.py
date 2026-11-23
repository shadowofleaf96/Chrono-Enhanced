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

print("Navigating to /ops/reconciliation/rider-list...")
eval_js("window.location.href = '/ops/reconciliation/rider-list'")
time.sleep(5)

# Find first reconcile link or button
js = '''(() => {
    const links = Array.from(document.querySelectorAll('a, button, span')).filter(el => (el.innerText || '').trim() === 'Reconcile');
    if (links.length > 0) {
        links[0].click();
        return 'clicked reconcile';
    }
    return 'no reconcile found';
})()'''
print("Click reconcile:", eval_js(js))
time.sleep(4)
print("Current URL:", eval_js("window.location.href"))

subprocess.run([adb, "shell", "screencap", "-p", "/sdcard/recon_detail.png"])
subprocess.run([adb, "pull", "/sdcard/recon_detail.png", "recon_detail_page.png"])
print("Saved recon_detail_page.png")

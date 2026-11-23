import subprocess, json, urllib.request, websocket, time

adb = r"C:\Users\simok\AppData\Local\Android\Sdk\platform-tools\adb.exe"
pid = subprocess.check_output([adb, 'shell', 'pidof', 'com.chrono.mohammedia']).decode().strip()
subprocess.run(f'"{adb}" forward tcp:9225 localabstract:webview_devtools_remote_{pid}', shell=True)

res = urllib.request.urlopen('http://127.0.0.1:9225/json', timeout=5).read()
tabs = json.loads(res.decode())
ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'], suppress_origin=True)

def eval_js(expr):
    msg_id = int(time.time() * 1000) % 100000
    ws.send(json.dumps({'id': msg_id, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
    resp = json.loads(ws.recv())
    return resp.get('result', {}).get('result', {}).get('value')

print("Navigating to /ops/consignments...")
eval_js("window.location.href = '/ops/consignments'")
time.sleep(5)
print("Current URL:", eval_js("window.location.href"))

# Check all containers and heights
inspect_js = """(() => {
    const list = [];
    const all = document.querySelectorAll('*');
    for (let el of all) {
        if (!el.className || typeof el.className !== 'string') continue;
        const c = el.className;
        if (c.includes('navbar') || c.includes('tabs') || c.includes('searchUpload') || c.includes('filter') || c.includes('table') || c.includes('container') || c.includes('mainDiv') || c.includes('contentDiv')) {
            const r = el.getBoundingClientRect();
            list.push({
                tag: el.tagName,
                cls: c.slice(0, 60),
                rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
                style: {
                    display: window.getComputedStyle(el).display,
                    height: window.getComputedStyle(el).height,
                    maxHeight: window.getComputedStyle(el).maxHeight,
                    flex: window.getComputedStyle(el).flex,
                    overflow: window.getComputedStyle(el).overflow
                },
                childCount: el.children.length
            });
        }
    }
    return list;
})()"""

items = eval_js(inspect_js)
print(f"Matched {len(items or [])} elements:")
for it in (items or []):
    print(f"{it['tag']}.{it['cls']} -> rect: {it['rect']}, h={it['style']['height']}, maxH={it['style']['maxHeight']}, flex={it['style']['flex']}, ovf={it['style']['overflow']}, children={it['childCount']}")

# Also take screenshot
subprocess.run([adb, "shell", "screencap", "-p", "/sdcard/cons.png"])
subprocess.run([adb, "pull", "/sdcard/cons.png", "consignments_page.png"])
print("Saved consignments_page.png")

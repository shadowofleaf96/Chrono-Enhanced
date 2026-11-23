import subprocess, json, urllib.request, websocket

adb = r"C:\Users\simok\AppData\Local\Android\Sdk\platform-tools\adb.exe"
pid = subprocess.check_output([adb, 'shell', 'pidof', 'com.chrono.mohammedia']).decode().strip()
subprocess.run(f'"{adb}" forward tcp:9225 localabstract:webview_devtools_remote_{pid}', shell=True)

res = urllib.request.urlopen('http://127.0.0.1:9225/json', timeout=5).read()
tabs = json.loads(res.decode())
ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'], suppress_origin=True)

def eval_js(expr):
    ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True}}))
    return json.loads(ws.recv()).get('result', {}).get('result', {}).get('value')

js = '''(() => {
    const targets = [
        '#root',
        '[class*="lr-mainDiv-"]',
        '[class*="lr-contentDiv-"]',
        '[class*="_d-mainDiv-"]',
        '[class*="container-0-3-179"]',
        '[class*="tabDataContainer-"]',
        '[class*="Ql-mainDiv-"]',
        '[class*="Ql-tableContainer-"]'
    ];
    return targets.map(sel => {
        const el = document.querySelector(sel);
        if (!el) return { sel, found: false };
        const cs = window.getComputedStyle(el);
        return {
            sel,
            found: true,
            inlineStyle: el.getAttribute('style') || '',
            height: cs.height,
            minHeight: cs.minHeight,
            maxHeight: cs.maxHeight,
            flex: cs.flex,
            overflowY: cs.overflowY,
            position: cs.position
        };
    });
})()'''
print(json.dumps(eval_js(js), indent=2))

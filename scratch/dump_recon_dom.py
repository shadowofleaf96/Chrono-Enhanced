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
    function walk(node, depth = 0) {
        if (!node || depth > 5) return null;
        const r = node.getBoundingClientRect();
        return {
            tag: node.tagName,
            cls: (node.className || '').toString().slice(0, 45),
            id: node.id || '',
            h: Math.round(r.height),
            w: Math.round(r.width),
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            display: window.getComputedStyle(node).display,
            children: Array.from(node.children).map(c => walk(c, depth + 1)).filter(Boolean)
        };
    }
    return walk(document.getElementById('root'));
})()'''
tree = eval_js(js)
with open('scratch/dom_recon_tree.json', 'w', encoding='utf-8') as f:
    json.dump(tree, f, indent=2)
print("Dumped dom_recon_tree.json")

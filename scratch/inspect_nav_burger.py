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
    const nav = document.querySelector('[class*="navbar-"]');
    if (!nav) return 'no nav';
    const leftDiv = nav.querySelector('[class*="leftDiv-"]');
    const burger = document.querySelector('#sidemenu_hamburger_icon');
    const filterTools = nav.querySelector('[class*="filterGroupToolsRight-"]');
    const el = document.querySelector('[class*="leftDiv-"]');
    const cs = window.getComputedStyle(el);
    const navCs = window.getComputedStyle(nav);
    return {
        navScrollLeft: nav.scrollLeft,
        navDisplay: navCs.display,
        navJustify: navCs.justifyContent,
        position: cs.position,
        left: cs.left,
        margin: cs.margin,
        marginLeft: cs.marginLeft,
        transform: cs.transform
    };
})()'''
print(json.dumps(eval_js(js), indent=2))

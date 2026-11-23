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

test_css = """
html, body, #root,
[class*="lr-mainDiv-"],
[class*="lr-contentDiv-"],
[class*="_d-mainDiv-"],
[class*="container-0-3-179"],
[class*="tabDataContainer-"],
[class*="Ql-mainDiv-"],
[class*="Ql-tableContainer-"],
[class*="Ql-tableContainer-"] > div,
[class*="tableParent-"] {
    display: flex !important;
    flex-direction: column !important;
    flex: 1 1 auto !important;
    height: 100% !important;
    min-height: 0 !important;
    overflow: hidden !important;
}

.ant-table-wrapper,
.ant-spin-nested-loading,
.ant-spin-container,
.ant-table {
    display: flex !important;
    flex-direction: column !important;
    flex: 1 1 auto !important;
    height: 100% !important;
    min-height: 0 !important;
    overflow: hidden !important;
}

.ant-table-container {
    display: flex !important;
    flex-direction: column !important;
    flex: 1 1 auto !important;
    height: 100% !important;
    min-height: 0 !important;
    overflow: hidden !important;
}

.ant-table-header {
    flex: 0 0 auto !important;
    overflow-x: hidden !important;
}

.ant-table-body {
    flex: 1 1 auto !important;
    height: 100% !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow-y: auto !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
}
"""

inject_js = f"""(() => {{
    let s = document.getElementById('test-flex-fix');
    if (!s) {{
        s = document.createElement('style');
        s.id = 'test-flex-fix';
        document.head.appendChild(s);
    }}
    s.textContent = `{test_css}`;
    return 'injected!';
}})()"""

print("Inject result:", eval_js(inject_js))
time.sleep(1)

subprocess.run([adb, "shell", "screencap", "-p", "/sdcard/cons_test.png"])
subprocess.run([adb, "pull", "/sdcard/cons_test.png", "consignments_flex_tested.png"])
print("Pulled consignments_flex_tested.png")

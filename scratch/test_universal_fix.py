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

recon_css = """
html, body, #root,
[class*="topDiv-"],
[class*="mainDiv-"],
[class*="lr-mainDiv-"],
[class*="lr-contentDiv-"],
[class*="Ze-mainDiv-"],
[class*="_d-mainDiv-"],
[class*="Ql-mainDiv-"],
[class*="Oe-mainDiv-"],
[class*="container-"],
[class*="tabDataContainer-"] {
  display: flex !important;
  flex-direction: column !important;
  flex: 1 1 auto !important;
  height: 100% !important;
  min-height: 0 !important;
}

[class*="mainDiv-"] > div:has([class*="tableParent-"]),
[class*="mainDiv-"] > div:has(.shipsy-fixed-header-table),
[class*="mainDiv-"] > div[style*="height: 100%"],
[class*="tableContainer-"] {
  display: flex !important;
  flex-direction: column !important;
  flex: 1 1 auto !important;
  height: 100% !important;
  min-height: 300px !important;
  position: relative !important;
}

[class*="tableParent-"],
.shipsy-fixed-header-table,
[class*="compactTable-"] {
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  flex: 1 1 auto !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 300px !important;
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
}

.ant-table-container {
  display: flex !important;
  flex-direction: column !important;
  flex: 1 1 auto !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow-x: auto !important;
}

.ant-table-body {
  flex: 1 1 auto !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch !important;
}
"""

inject_js = f"""(() => {{
    let s = document.getElementById('test-universal-fix');
    if (!s) {{
        s = document.createElement('style');
        s.id = 'test-universal-fix';
        document.head.appendChild(s);
    }}
    s.textContent = `{recon_css}`;
    return 'injected universal fix!';
}})()"""

print("Universal fix:", eval_js(inject_js))
time.sleep(1)

subprocess.run([adb, "shell", "screencap", "-p", "/sdcard/recon_fixed.png"])
subprocess.run([adb, "pull", "/sdcard/recon_fixed.png", "recon_fixed_verified.png"])
print("Saved recon_fixed_verified.png")

import subprocess, json, urllib.request, time
import websocket

adb = r"C:\Users\simok\AppData\Local\Android\Sdk\platform-tools\adb.exe"

def get_ws():
    pid = subprocess.check_output([adb, "shell", "pidof", "com.chrono.mohammedia"]).decode().strip()
    subprocess.run(f'"{adb}" forward tcp:9225 localabstract:webview_devtools_remote_{pid}', shell=True)
    res = urllib.request.urlopen("http://localhost:9225/json").read()
    tabs = json.loads(res.decode())
    ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], suppress_origin=True)
    ws.settimeout(15.0)
    return ws

def eval_js(ws, expr):
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
    msg = json.loads(ws.recv())
    return msg.get("result", {}).get("result", {}).get("value")

def screencap(name):
    subprocess.run(f'"{adb}" shell screencap -p /sdcard/{name}', shell=True)
    subprocess.run(f'"{adb}" pull /sdcard/{name} {name}', shell=True)

if __name__ == "__main__":
    ws = get_ws()
    
    # Restore position sticky for fixed columns and test
    eval_js(ws, """(() => {
        let style = document.getElementById('restore-sticky-columns');
        if (!style) {
            style = document.createElement('style');
            style.id = 'restore-sticky-columns';
            document.head.appendChild(style);
        }
        style.textContent = `
            .ant-table-cell-fix-left,
            .ant-table-cell-fix-left-last {
                position: sticky !important;
                position: -webkit-sticky !important;
                z-index: 3 !important;
                background: #ffffff !important;
            }
            .ant-table-thead th.ant-table-cell-fix-left,
            .ant-table-thead th.ant-table-cell-fix-left-last {
                background: #fafafa !important;
                z-index: 4 !important;
            }
        `;
    })()""")
    
    time.sleep(1)
    screencap("consignments_sticky_restored.png")
    
    cells = eval_js(ws, """(() => {
        const ths = Array.from(document.querySelectorAll('.ant-table-thead th')).map(th => {
            const r = th.getBoundingClientRect();
            return {
                text: th.innerText.replace(/\\s+/g, ' ').substring(0, 30),
                rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
            };
        });
        const tds = Array.from(document.querySelectorAll('.ant-table-tbody > tr:nth-child(2) > td')).map(td => {
            const r = td.getBoundingClientRect();
            return {
                text: td.innerText.replace(/\\s+/g, ' ').substring(0, 30),
                rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
            };
        });
        return { ths: ths.slice(0, 5), tds: tds.slice(0, 5) };
    })()""")
    print("Cells after sticky restore:", json.dumps(cells, indent=2))
    ws.close()

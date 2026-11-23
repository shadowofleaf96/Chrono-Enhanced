import subprocess, json, urllib.request
import websocket

adb = r"C:\Users\simok\AppData\Local\Android\Sdk\platform-tools\adb.exe"

def get_ws():
    pid = subprocess.check_output([adb, "shell", "pidof", "com.chrono.mohammedia"]).decode().strip()
    subprocess.run(f'"{adb}" forward tcp:9225 localabstract:webview_devtools_remote_{pid}', shell=True)
    res = urllib.request.urlopen("http://localhost:9225/json").read()
    tabs = json.loads(res.decode())
    ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], suppress_origin=True)
    ws.settimeout(6.0)
    return ws

def eval_js(ws, expr):
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
    msg = json.loads(ws.recv())
    return msg.get("result", {}).get("result", {}).get("value")

if __name__ == "__main__":
    ws = get_ws()
    info = eval_js(ws, """(() => {
        const tr = document.querySelector('.ant-table-tbody > tr');
        if (!tr) return 'no tr';
        return {
            cells: Array.from(tr.querySelectorAll('td')).map(td => ({
                text: td.innerText,
                html: td.innerHTML.substring(0, 150),
                hasClick: !!td.onclick,
                cursor: window.getComputedStyle(td).cursor
            }))
        };
    })()""")
    print("Row cells:", json.dumps(info, indent=2))
    ws.close()

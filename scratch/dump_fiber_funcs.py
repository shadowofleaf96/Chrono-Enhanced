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
        const btn = document.getElementById('sidemenu_hamburger_icon');
        const k = Object.keys(btn).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        let cur = btn[k];
        let found = [];
        while (cur) {
            if (cur.memoizedProps) {
                const keys = Object.keys(cur.memoizedProps);
                const funcs = keys.filter(f => typeof cur.memoizedProps[f] === 'function');
                if (funcs.length > 0) {
                    found.push({ tag: cur.tag, funcs, keys });
                }
            }
            cur = cur.return;
        }
        return found;
    })()""")
    print("Props and funcs on fiber:", json.dumps(info, indent=2))
    ws.close()

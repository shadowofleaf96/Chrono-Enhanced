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

if __name__ == "__main__":
    ws = get_ws()
    
    # Identify exact elements occupying y between 150 and 520
    info = eval_js(ws, """(() => {
        const found = [];
        // Walk from document.elementFromPoint
        for (let y = 160; y <= 500; y += 40) {
            const el = document.elementFromPoint(200, y);
            if (el) {
                const r = el.getBoundingClientRect();
                const cs = window.getComputedStyle(el);
                found.push({
                    y_sampled: y,
                    tag: el.tagName,
                    id: el.id,
                    className: el.className,
                    rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) },
                    bg: cs.backgroundColor,
                    visibility: cs.visibility,
                    display: cs.display
                });
            }
        }
        return found;
    })()""")
    print("Sampled elements in white space:")
    print(json.dumps(info, indent=2))
    ws.close()

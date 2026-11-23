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
    
    # Dismiss any notification overlay if needed
    subprocess.run(f'"{adb}" shell input keyevent KEYCODE_BACK', shell=True)
    time.sleep(1)
    
    elements = eval_js(ws, """(() => {
        const all = document.querySelectorAll('*');
        const visible = [];
        all.forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 20 && r.height > 20 && r.top < 600 && r.bottom > 60) {
                const cs = window.getComputedStyle(el);
                if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0') {
                    // Only keep non-container leaf-like or notable elements
                    visible.push({
                        tag: el.tagName,
                        id: el.id,
                        className: el.className.toString().substring(0, 50),
                        top: Math.round(r.top),
                        bottom: Math.round(r.bottom),
                        height: Math.round(r.height),
                        width: Math.round(r.width),
                        bg: cs.backgroundColor,
                        text: el.children.length === 0 ? el.innerText.substring(0, 30) : null
                    });
                }
            }
        });
        return visible;
    })()""")
    
    print("Visible elements in y=60..600:")
    print(json.dumps(elements[:30], indent=2))
    ws.close()

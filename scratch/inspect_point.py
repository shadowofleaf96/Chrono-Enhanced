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
    
    info = eval_js(ws, """(() => {
        const el = document.elementFromPoint(100, 300);
        if (!el) return 'nothing';
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        
        // Also check if any element has z-index or background covering it
        const elementsAtPoint = [];
        let cur = el;
        while (cur && cur !== document.body) {
            elementsAtPoint.push({
                tag: cur.tagName,
                className: cur.className,
                id: cur.id,
                bg: window.getComputedStyle(cur).backgroundColor,
                zIndex: window.getComputedStyle(cur).zIndex,
                rect: cur.getBoundingClientRect()
            });
            cur = cur.parentElement;
        }
        
        return {
            target: {
                tag: el.tagName,
                className: el.className,
                id: el.id,
                innerText: el.innerText.substring(0, 100),
                rect,
                bg: cs.backgroundColor,
                color: cs.color,
                opacity: cs.opacity,
                visibility: cs.visibility
            },
            chain: elementsAtPoint
        };
    })()""")
    print("Element at (100, 300):", json.dumps(info, indent=2))
    ws.close()

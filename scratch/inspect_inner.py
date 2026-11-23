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
        const mc0 = document.querySelector('[class*="Ql-mainDiv-"]').children[0];
        const inner = mc0.children[0];
        return Array.from(inner.children).map(c => {
            const r = c.getBoundingClientRect();
            return {
                tag: c.tagName,
                id: c.id,
                className: c.className,
                top: Math.round(r.top),
                bottom: Math.round(r.bottom),
                height: Math.round(r.height),
                style: c.style.cssText,
                display: window.getComputedStyle(c).display,
                text: c.innerText.replace(/\\s+/g, ' ').substring(0, 60)
            };
        });
    })()""")
    print("Inner children:")
    print(json.dumps(info, indent=2))
    ws.close()

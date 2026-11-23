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
        const mainDiv = document.querySelector('[class*="Ql-mainDiv-"]');
        const c0 = mainDiv ? mainDiv.children[0] : null;
        if (!c0) return 'no c0';
        return {
            tag: c0.tagName,
            className: c0.className,
            innerHTML_preview: c0.innerHTML.substring(0, 300),
            computedStyle: {
                display: window.getComputedStyle(c0).display,
                flex: window.getComputedStyle(c0).flex,
                height: window.getComputedStyle(c0).height,
                overflow: window.getComputedStyle(c0).overflow
            },
            children: Array.from(c0.children).map(c => ({
                tag: c.tagName,
                className: c.className,
                rect: c.getBoundingClientRect()
            }))
        };
    })()""")
    print("Children[0] info:")
    print(json.dumps(info, indent=2))
    ws.close()

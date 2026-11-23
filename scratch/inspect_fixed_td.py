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
        const td = document.querySelector('.ant-table-cell-fix-left-last');
        if (!td) return 'no td';
        const cs = window.getComputedStyle(td);
        return {
            tag: td.tagName,
            text: td.innerText,
            rect: td.getBoundingClientRect(),
            position: cs.position,
            left: cs.left,
            right: cs.right,
            zIndex: cs.zIndex,
            overflow: cs.overflow,
            display: cs.display,
            visibility: cs.visibility,
            opacity: cs.opacity,
            color: cs.color,
            bg: cs.backgroundColor,
            inlineStyle: td.style.cssText
        };
    })()""")
    print("Fixed TD details:", json.dumps(info, indent=2))
    ws.close()

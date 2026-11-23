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
        const sud = document.querySelector('[class*="searchUploadDiv-"]');
        if (!sud) return 'no sud';
        const cs = window.getComputedStyle(sud);
        return {
            tag: sud.tagName,
            className: sud.className,
            height: cs.height,
            minHeight: cs.minHeight,
            flex: cs.flex,
            flexDirection: cs.flexDirection,
            children: Array.from(sud.children).map(c => {
                const r = c.getBoundingClientRect();
                return {
                    tag: c.tagName,
                    className: c.className,
                    height: Math.round(r.height),
                    text: c.innerText.replace(/\\s+/g, ' ').substring(0, 40)
                };
            })
        };
    })()""")
    print("searchUploadDiv details:", json.dumps(info, indent=2))
    ws.close()

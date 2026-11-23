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
        const c0 = sud.children[0];
        return {
            c0_className: c0.className,
            c0_style: c0.style.cssText,
            c0_computed: {
                height: window.getComputedStyle(c0).height,
                display: window.getComputedStyle(c0).display,
                flex: window.getComputedStyle(c0).flex,
                flexDirection: window.getComputedStyle(c0).flexDirection
            },
            c0_children: Array.from(c0.children).map(cc => {
                const r = cc.getBoundingClientRect();
                return {
                    tag: cc.tagName,
                    className: cc.className,
                    height: Math.round(r.height),
                    style: cc.style.cssText,
                    text: cc.innerText.replace(/\\s+/g, ' ').substring(0, 40)
                };
            })
        };
    })()""")
    print("c0 inside searchUploadDiv:", json.dumps(info, indent=2))
    ws.close()

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
        const c0 = mainDiv.children[0];
        const innerDiv = c0.querySelector('div');
        return {
            c0_style: c0.style.cssText,
            c0_outerHTML: c0.outerHTML.substring(0, 500),
            c0_scrollHeight: c0.scrollHeight,
            c0_offsetHeight: c0.offsetHeight,
            mainDiv_height: mainDiv.offsetHeight,
            mainDiv_style: mainDiv.style.cssText,
            innerDiv_style: innerDiv ? innerDiv.style.cssText : null,
            innerDiv_offsetHeight: innerDiv ? innerDiv.offsetHeight : null
        };
    })()""")
    print("C0 style details:", json.dumps(info, indent=2))
    ws.close()

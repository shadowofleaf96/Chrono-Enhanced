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
        const leftDiv = document.querySelector('[class*="leftDiv-"]');
        if (!leftDiv) return 'no leftDiv';
        const parent = leftDiv.parentElement;
        return {
            parentTag: parent ? parent.tagName : null,
            parentClass: parent ? parent.className : null,
            grandparentTag: parent && parent.parentElement ? parent.parentElement.tagName : null,
            grandparentClass: parent && parent.parentElement ? parent.parentElement.className : null,
            leftDivChildren: Array.from(leftDiv.children).map(c => ({
                tag: c.tagName,
                id: c.id,
                className: c.className,
                text: c.innerText
            }))
        };
    })()""")
    print("Navbar DOM structure:", json.dumps(info, indent=2))
    ws.close()

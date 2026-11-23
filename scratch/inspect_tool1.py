import subprocess, json, urllib.request
import websocket

adb = r"C:\Users\simok\AppData\Local\Android\Sdk\platform-tools\adb.exe"

def get_ws():
    pid = subprocess.check_output([adb, "shell", "pidof", "com.chrono.mohammedia"]).decode().strip()
    subprocess.run(f'"{adb}" forward tcp:9225 localabstract:webview_devtools_remote_{pid}', shell=True)
    res = urllib.request.urlopen("http://localhost:9225/json").read()
    tabs = json.loads(res.decode())
    return websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], suppress_origin=True)

def eval_js(ws, expr):
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
    msg = json.loads(ws.recv())
    return msg.get("result", {}).get("result", {}).get("value")

if __name__ == "__main__":
    ws = get_ws()
    res = eval_js(ws, """(() => {
        const tools = document.querySelector('[class*="filterGroupToolsRight-"]');
        if (!tools) return 'no tools';
        const first = tools.firstElementChild;
        return {
            toolsScrollLeft: tools.scrollLeft,
            toolsScrollWidth: tools.scrollWidth,
            toolsClientWidth: tools.clientWidth,
            firstOuterHTML: first ? first.outerHTML : null,
            firstRect: first ? first.getBoundingClientRect() : null,
            firstChildren: first ? Array.from(first.querySelectorAll('*')).map(el => ({
                tag: el.tagName,
                cls: el.className,
                rect: el.getBoundingClientRect(),
                width: window.getComputedStyle(el).width,
                overflow: window.getComputedStyle(el).overflow,
                text: el.innerText ? el.innerText.trim() : ''
            })) : []
        };
    })()""")
    print(json.dumps(res, indent=2))

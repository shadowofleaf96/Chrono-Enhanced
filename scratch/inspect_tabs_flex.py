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
        const tabs = document.querySelector('.tabsContainer-0-3-333');
        const cs = window.getComputedStyle(tabs);
        return {
            flex: cs.flex,
            flexGrow: cs.flexGrow,
            flexShrink: cs.flexShrink,
            flexBasis: cs.flexBasis,
            alignSelf: cs.alignSelf,
            padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
            margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
            border: `${cs.borderTopWidth} ${cs.borderBottomWidth}`,
            boxSizing: cs.boxSizing
        };
    })()""")
    print("Tabs style details:", json.dumps(info, indent=2))
    
    # What happens if we set tabs to flex: 0 0 auto !important; height: auto !important; max-height: 50px !important;
    res = eval_js(ws, """(() => {
        const tabs = document.querySelector('.tabsContainer-0-3-333');
        if (tabs) {
            tabs.style.setProperty('flex', '0 0 auto', 'important');
            tabs.style.setProperty('height', 'auto', 'important');
            tabs.style.setProperty('max-height', '50px', 'important');
        }
        return {
            newHeight: tabs ? tabs.offsetHeight : null
        };
    })()""")
    print("After setting flex: 0 0 auto:", res)
    ws.close()

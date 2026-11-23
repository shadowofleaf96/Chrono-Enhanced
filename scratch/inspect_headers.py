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
    
    pages = [
        "/consignments",
        "/retail/trip-manager",
        "/reconciliation/rider-list"
    ]
    
    for p in pages:
        eval_js(ws, f"""(() => {{
            const h = document.getElementById('sidemenu_hamburger_icon');
            const k = Object.keys(h).find(k => k.startsWith('__reactFiber'));
            let cur = h[k];
            while (cur) {{
                if (cur.memoizedProps && cur.memoizedProps.history) {{
                    cur.memoizedProps.history.push('{p}');
                    break;
                }}
                cur = cur.return;
            }}
        }})()""")
        time.sleep(3)
        
        info = eval_js(ws, """(() => {
            const header = document.querySelector('header');
            const leftDiv = document.querySelector('[class*="leftDiv-"]');
            const tools = document.querySelector('[class*="filterGroupToolsRight-"]');
            return {
                url: location.pathname,
                headerTag: header ? header.tagName : null,
                headerClasses: header ? header.className : null,
                leftDivText: leftDiv ? leftDiv.innerText.replace(/\\n/g, ' ') : null,
                toolsChildren: tools ? Array.from(tools.children).map(c => ({
                    tag: c.tagName,
                    className: c.className,
                    text: c.innerText.replace(/\\n/g, ' ').substring(0, 40)
                })) : null
            };
        })()""")
        print(f"--- Info for {p} ---")
        print(json.dumps(info, indent=2))
        
    ws.close()

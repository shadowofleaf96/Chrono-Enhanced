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
    
    # 1. Ensure we are on consignments
    eval_js(ws, """(() => {
        const h = document.getElementById('sidemenu_hamburger_icon');
        const k = Object.keys(h).find(k => k.startsWith('__reactFiber'));
        let cur = h[k];
        while (cur) {
            if (cur.memoizedProps && cur.memoizedProps.history) {
                cur.memoizedProps.history.push('/consignments');
                break;
            }
            cur = cur.return;
        }
    })()""")
    time.sleep(3)
    
    # 2. Inspect what is inside container-0-3-336 and tabDataContainer
    info = eval_js(ws, """(() => {
        const container = document.querySelector('[class*="container-"]');
        const tabData = document.querySelector('[class*="tabDataContainer-"]');
        const mainDiv = document.querySelector('[class*="Ql-mainDiv-"]') || document.querySelector('[class*="mainDiv-"]');
        
        function summarize(el) {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
                tag: el.tagName,
                className: el.className,
                rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) },
                children: Array.from(el.children).map(c => {
                    const cr = c.getBoundingClientRect();
                    return {
                        tag: c.tagName,
                        className: c.className.substring(0, 40),
                        top: Math.round(cr.top),
                        bottom: Math.round(cr.bottom),
                        height: Math.round(cr.height),
                        display: window.getComputedStyle(c).display
                    };
                })
            };
        }
        
        return {
            container: summarize(container),
            tabData: summarize(tabData),
            mainDiv: summarize(mainDiv)
        };
    })()""")
    print("Consignments structure:")
    print(json.dumps(info, indent=2))
    ws.close()

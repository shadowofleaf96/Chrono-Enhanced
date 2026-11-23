import subprocess, json, urllib.request, time
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
    
    # Inspect Trip Manager DOM hierarchy
    res = eval_js(ws, """(() => {
        // If not on trip manager, push it
        const nav = document.querySelector('[class*="navbar-"]') || document.querySelector('#root');
        let fiber = nav ? nav[Object.keys(nav).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))] : null;
        let cur = fiber;
        while (cur) {
            if (cur.memoizedProps && cur.memoizedProps.history) {
                cur.memoizedProps.history.push('/retail/trip-manager');
                break;
            }
            cur = cur.return;
        }
        
        const table = document.querySelector('.ant-table');
        let parents = [];
        let p = table;
        while (p && p !== document.body) {
            const r = p.getBoundingClientRect();
            parents.push({
                tag: p.tagName,
                cls: p.className,
                rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) },
                computedHeight: window.getComputedStyle(p).height,
                overflow: window.getComputedStyle(p).overflow,
                display: window.getComputedStyle(p).display
            });
            p = p.parentElement;
        }
        return {
            url: location.href,
            hasTable: !!table,
            rowsCount: document.querySelectorAll('.ant-table-tbody > tr').length,
            parents
        };
    })()""")
    print("Trip Manager DOM hierarchy:", json.dumps(res, indent=2))

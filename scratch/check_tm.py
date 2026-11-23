import subprocess, json, urllib.request, time
import websocket

adb = r"C:\Users\simok\AppData\Local\Android\Sdk\platform-tools\adb.exe"

def get_ws():
    pid = subprocess.check_output([adb, "shell", "pidof", "com.chrono.mohammedia"]).decode().strip()
    subprocess.run(f'"{adb}" forward tcp:9225 localabstract:webview_devtools_remote_{pid}', shell=True)
    res = urllib.request.urlopen("http://localhost:9225/json").read()
    tabs = json.loads(res.decode())
    ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], suppress_origin=True)
    ws.settimeout(6.0)
    return ws

def eval_js(ws, expr):
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
    msg = json.loads(ws.recv())
    return msg.get("result", {}).get("result", {}).get("value")

def screencap(name):
    subprocess.run(f'"{adb}" shell screencap -p /sdcard/{name}', shell=True)
    subprocess.run(f'"{adb}" pull /sdcard/{name} {name}', shell=True)

if __name__ == "__main__":
    ws = get_ws()
    
    # 1. Navigate to Trip Manager
    eval_js(ws, """(() => {
        const nav = document.querySelector('[class*="navbar-"]') || document.querySelector('#root');
        let fiber = nav ? nav[Object.keys(nav).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))] : null;
        let cur = fiber;
        while (cur) {
            if (cur.memoizedProps && cur.memoizedProps.history) {
                cur.memoizedProps.history.push('/retail/trip-manager');
                return 'pushed';
            }
            cur = cur.return;
        }
        return 'no history';
    })()""")
    
    time.sleep(3)
    
    # Inspect table in Trip Manager
    info = eval_js(ws, """(() => {
        const tables = Array.from(document.querySelectorAll('.ant-table'));
        const rows = document.querySelectorAll('.ant-table-tbody > tr');
        return {
            tablesCount: tables.length,
            rowsCount: rows.length,
            tableRects: tables.map(t => {
                const r = t.getBoundingClientRect();
                return { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) };
            }),
            tableParents: tables.length > 0 ? Array.from(tables[0].parentElement.children).map(c => c.className) : []
        };
    })()""")
    print("Trip Manager Table Info:", json.dumps(info, indent=2))
    screencap("trip_manager_now.png")
    ws.close()

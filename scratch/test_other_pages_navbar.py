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

def screencap(name):
    subprocess.run(f'"{adb}" shell screencap -p /sdcard/{name}', shell=True)
    subprocess.run(f'"{adb}" pull /sdcard/{name} {name}', shell=True)

if __name__ == "__main__":
    ws = get_ws()
    
    # 1. Consignments
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
    time.sleep(4)
    screencap("preview_consignments_single_row.png")
    
    # 2. Trip Manager
    eval_js(ws, """(() => {
        const h = document.getElementById('sidemenu_hamburger_icon');
        const k = Object.keys(h).find(k => k.startsWith('__reactFiber'));
        let cur = h[k];
        while (cur) {
            if (cur.memoizedProps && cur.memoizedProps.history) {
                cur.memoizedProps.history.push('/retail/trip-manager');
                break;
            }
            cur = cur.return;
        }
    })()""")
    time.sleep(4)
    screencap("preview_trip_manager_single_row.png")
    
    ws.close()
    print("Done previews!")

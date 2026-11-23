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
    res = eval_js(ws, """(() => {
        const hamburger = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
        if (!hamburger) return 'no hamburger';
        const k = Object.keys(hamburger).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        let cur = hamburger[k];
        while (cur) {
            if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
                cur.memoizedProps.toggleSideMenu();
                return 'SUCCESS: called toggleSideMenu!';
            }
            cur = cur.return;
        }
        return 'FAILED: toggleSideMenu not found on fiber';
    })()""")
    print("Direct toggle result:", res)
    time.sleep(1.5)
    screencap("direct_toggle_result.png")
    ws.close()

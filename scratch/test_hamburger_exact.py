import subprocess, json, urllib.request
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

if __name__ == "__main__":
    ws = get_ws()
    info = eval_js(ws, """(() => {
        const btn = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
        const dpr = window.devicePixelRatio;
        const r = btn ? btn.getBoundingClientRect() : null;
        
        // Also check if toggleSideMenu is callable
        const nav = document.querySelector('header') || document.querySelector('[class*="navbar-"]');
        let toggleMethodFound = false;
        if (nav) {
            let fiber = nav[Object.keys(nav).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))];
            let cur = fiber;
            while (cur) {
                if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
                    toggleMethodFound = true;
                    // Test calling it right now!
                    cur.memoizedProps.toggleSideMenu();
                    break;
                }
                cur = cur.return;
            }
        }
        
        return {
            hasBtn: !!btn,
            dpr,
            btnRect: r,
            toggleMethodFound
        };
    })()""")
    print("Hamburger test:", json.dumps(info, indent=2))
    ws.close()

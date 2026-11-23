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

def screencap(name):
    subprocess.run(f'"{adb}" shell screencap -p /sdcard/{name}', shell=True)
    subprocess.run(f'"{adb}" pull /sdcard/{name} {name}', shell=True)

def navigate_and_capture(ws, path, filename):
    print(f"Navigating to {path}...")
    # React Router push
    expr = f"""(() => {{
        const mask = document.querySelector('.ant-drawer-mask');
        if (mask) mask.click();
        
        const nav = document.querySelector('[class*="navbar-"]') || document.querySelector('#root');
        let fiber = nav ? nav[Object.keys(nav).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))] : null;
        let cur = fiber;
        let history = null;
        while (cur) {{
            if (cur.memoizedProps && cur.memoizedProps.history) {{
                history = cur.memoizedProps.history;
                break;
            }}
            cur = cur.return;
        }}
        if (history) {{
            history.push('{path}');
            return 'Pushed to history';
        }} else {{
            window.location.pathname = '/ops{path}';
            return 'Changed location.pathname';
        }}
    }})()"""
    res = eval_js(ws, expr)
    print("Nav result:", res)
    time.sleep(3)
    screencap(filename)
    
    # Check layout details on this page
    info = eval_js(ws, """(() => {
        return {
            url: location.href,
            bodyWidth: document.body.scrollWidth,
            windowWidth: window.innerWidth,
            hasHorizontalScroll: document.body.scrollWidth > window.innerWidth,
            tablesCount: document.querySelectorAll('table, .ant-table').length,
            buttonsCount: document.querySelectorAll('button, .ant-btn').length,
            errors: window.__errors || []
        };
    })()""")
    print(f"Page info for {path}:", json.dumps(info, indent=2))

if __name__ == "__main__":
    ws = get_ws()
    
    # Check consignments
    screencap("test_consignments.png")
    
    # Navigate to trip manager
    navigate_and_capture(ws, "/retail/trip-manager", "test_trip_manager.png")
    
    # Navigate to reconciliation rider list
    navigate_and_capture(ws, "/reconciliation/rider-list", "test_rider_list.png")

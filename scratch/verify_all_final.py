import subprocess, json, urllib.request, time
import websocket

adb = r"C:\Users\simok\AppData\Local\Android\Sdk\platform-tools\adb.exe"

def screencap(name):
    subprocess.run(f'"{adb}" shell screencap -p /sdcard/{name}', shell=True)
    subprocess.run(f'"{adb}" pull /sdcard/{name} {name}', shell=True)

def get_ws():
    pid = subprocess.check_output([adb, "shell", "pidof", "com.chrono.mohammedia"]).decode().strip()
    subprocess.run(f'"{adb}" forward tcp:9225 localabstract:webview_devtools_remote_{pid}', shell=True)
    res = urllib.request.urlopen("http://localhost:9225/json").read()
    tabs = json.loads(res.decode())
    ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], suppress_origin=True)
    ws.settimeout(10.0)
    return ws

def eval_js(ws, expr):
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
    msg = json.loads(ws.recv())
    return msg.get("result", {}).get("result", {}).get("value")

def push_route(ws, path):
    expr = f"""(() => {{
        const mask = document.querySelector('.ant-drawer-mask');
        if (mask) mask.click();
        const hamburger = document.getElementById('sidemenu_hamburger_icon');
        if (hamburger) {{
            const k = Object.keys(hamburger).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
            let cur = hamburger[k];
            while (cur) {{
                if (cur.memoizedProps && cur.memoizedProps.history) {{
                    cur.memoizedProps.history.push('{path}');
                    return 'pushed to history';
                }}
                cur = cur.return;
            }}
        }}
        return 'no history';
    }})()"""
    return eval_js(ws, expr)

if __name__ == "__main__":
    # Launch app
    subprocess.run(f'"{adb}" shell am start -n com.chrono.mohammedia/.ui.portal.PortalSelectorActivity', shell=True)
    time.sleep(1.5)
    subprocess.run(f'"{adb}" shell input tap 540 1160', shell=True)
    time.sleep(3.5)
    
    ws = get_ws()
    
    # Page 1: Consignments
    print("Testing Consignments...")
    push_route(ws, "/consignments")
    time.sleep(3)
    screencap("verified_1_consignments.png")
    
    # Page 2: Trip Manager
    print("Testing Trip Manager...")
    push_route(ws, "/retail/trip-manager")
    time.sleep(3.5)
    screencap("verified_2_trip_manager.png")
    
    # Page 3: Rider List
    print("Testing Rider List...")
    push_route(ws, "/reconciliation/rider-list")
    time.sleep(3.5)
    screencap("verified_3_rider_list.png")
    
    # Test Hamburger Drawer Open
    print("Testing Hamburger Drawer Open...")
    eval_js(ws, """(() => {
        const hamburger = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
        if (hamburger) {
            const k = Object.keys(hamburger).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
            let cur = hamburger[k];
            while (cur) {
                if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
                    cur.memoizedProps.toggleSideMenu();
                    return 'opened';
                }
                cur = cur.return;
            }
        }
        return 'no hamburger';
    })()""")
    time.sleep(1.5)
    screencap("verified_4_drawer.png")
    
    ws.close()
    print("Done verification!")

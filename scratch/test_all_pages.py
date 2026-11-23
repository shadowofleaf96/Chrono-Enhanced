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

def push_route(ws, path):
    expr = f"""(() => {{
        const mask = document.querySelector('.ant-drawer-mask');
        if (mask) mask.click();
        const nav = document.querySelector('[class*="navbar-"]') || document.querySelector('#root');
        let fiber = nav ? nav[Object.keys(nav).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))] : null;
        let cur = fiber;
        while (cur) {{
            if (cur.memoizedProps && cur.memoizedProps.history) {{
                cur.memoizedProps.history.push('{path}');
                return 'pushed';
            }}
            cur = cur.return;
        }}
        return 'no history';
    }})()"""
    return eval_js(ws, expr)

if __name__ == "__main__":
    ws = get_ws()
    print("Testing all supported pages on device...")
    
    # 1. Consignments
    print("1. Consignments Dashboard...")
    push_route(ws, "/consignments")
    time.sleep(3)
    info1 = eval_js(ws, """(() => {
        return {
            url: location.href,
            rows: document.querySelectorAll('.ant-table-tbody > tr').length,
            tableVisible: !!document.querySelector('.ant-table')
        };
    })()""")
    print("Consignments:", info1)
    screencap("page1_consignments.png")
    
    # 2. Trip Manager
    print("2. Trip Manager...")
    push_route(ws, "/retail/trip-manager")
    time.sleep(4)
    info2 = eval_js(ws, """(() => {
        return {
            url: location.href,
            rows: document.querySelectorAll('.ant-table-tbody > tr').length,
            hasExportSalary: !!Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Export Salary'))
        };
    })()""")
    print("Trip Manager:", info2)
    screencap("page2_trip_manager.png")
    
    # 3. Rider List
    print("3. Rider List...")
    push_route(ws, "/reconciliation/rider-list")
    time.sleep(4)
    info3 = eval_js(ws, """(() => {
        return {
            url: location.href,
            rows: document.querySelectorAll('.ant-table-tbody > tr').length,
            hasTable: !!document.querySelector('.ant-table')
        };
    })()""")
    print("Rider List:", info3)
    screencap("page3_rider_list.png")

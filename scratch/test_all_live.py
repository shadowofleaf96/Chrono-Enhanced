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
    
    # Check history push
    def nav(path):
        eval_js(ws, f"""(() => {{
            const h = document.getElementById('sidemenu_hamburger_icon');
            const k = Object.keys(h).find(k => k.startsWith('__reactFiber'));
            let cur = h[k];
            while (cur) {{
                if (cur.memoizedProps && cur.memoizedProps.history) {{
                    cur.memoizedProps.history.push('{path}');
                    return 'ok';
                }}
                cur = cur.return;
            }}
            return 'no-history';
        }})()""")
        
    print("Navigating to /consignments...")
    nav("/consignments")
    time.sleep(5)
    screencap("consignments_page_loaded.png")
    
    status1 = eval_js(ws, """(() => {
        return {
            url: location.href,
            title: document.title,
            tables: document.querySelectorAll('.ant-table').length,
            rows: document.querySelectorAll('.ant-table-tbody > tr').length,
            navbar: document.querySelector('header') ? {
                width: document.querySelector('header').offsetWidth,
                height: document.querySelector('header').offsetHeight,
                children: Array.from(document.querySelector('header').children).map(c => ({
                    className: c.className,
                    text: c.innerText.substring(0, 50),
                    width: c.offsetWidth,
                    height: c.offsetHeight
                }))
            } : null
        };
    })()""")
    print("Consignments status:", json.dumps(status1, indent=2))
    
    print("Navigating to /retail/trip-manager...")
    nav("/retail/trip-manager")
    time.sleep(5)
    screencap("trip_manager_page_loaded.png")
    
    status2 = eval_js(ws, """(() => {
        return {
            url: location.href,
            title: document.title,
            tables: document.querySelectorAll('.ant-table').length,
            rows: document.querySelectorAll('.ant-table-tbody > tr').length,
            navbar: document.querySelector('header') ? {
                width: document.querySelector('header').offsetWidth,
                height: document.querySelector('header').offsetHeight
            } : null
        };
    })()""")
    print("Trip Manager status:", json.dumps(status2, indent=2))
    
    ws.close()

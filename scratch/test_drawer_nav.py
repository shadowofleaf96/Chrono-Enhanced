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
    
    # Click Consignments in drawer left menu
    res1 = eval_js(ws, """(() => {
        const items = Array.from(document.querySelectorAll('.ant-drawer .ant-menu-item'));
        const consignments = items.find(i => i.innerText.trim() === 'Consignments');
        if (consignments) {
            consignments.click();
            return 'clicked Consignments in drawer';
        }
        return 'Consignments not found in drawer';
    })()""")
    print("Step 1:", res1)
    time.sleep(1)
    
    # Click Consignment Dashboard in right menu
    res2 = eval_js(ws, """(() => {
        const items = Array.from(document.querySelectorAll('.ant-drawer .ant-menu-item, .ant-drawer [role=\"menuitem\"]'));
        const dash = items.find(i => i.innerText.includes('Consignment Dashboard'));
        if (dash) {
            dash.click();
            return 'clicked Consignment Dashboard';
        }
        return 'Consignment Dashboard not found. Items: ' + items.map(i => i.innerText.trim()).join(', ');
    })()""")
    print("Step 2:", res2)
    time.sleep(1)
    
    # Auto-close drawer
    eval_js(ws, """(() => {
        const mask = document.querySelector('.ant-drawer-mask');
        if (mask) mask.click();
        const hamburger = document.getElementById('sidemenu_hamburger_icon');
        if (hamburger) {
            const k = Object.keys(hamburger).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
            let cur = hamburger[k];
            while (cur) {
                if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
                    if (document.querySelector('.ant-drawer-open')) cur.memoizedProps.toggleSideMenu();
                    break;
                }
                cur = cur.return;
            }
        }
    })()""")
    
    time.sleep(3)
    screencap("navigated_to_consignments.png")
    
    info = eval_js(ws, """(() => {
        return {
            url: location.href,
            title: document.title,
            rows: document.querySelectorAll('.ant-table-tbody > tr').length
        };
    })()""")
    print("Final state:", json.dumps(info, indent=2))
    ws.close()

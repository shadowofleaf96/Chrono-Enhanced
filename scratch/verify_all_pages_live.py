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
    
    # 1. Consignments Table Horizontal Swipe
    print("1. Testing Consignments Horizontal Scroll...")
    eval_js(ws, """(() => {
        const tb = document.querySelector('.ant-table-body');
        if (tb) tb.scrollLeft = 500;
    })()""")
    time.sleep(1)
    screencap("final_1_consignments_scrolled_horiz.png")
    
    # Reset scrollLeft
    eval_js(ws, """(() => {
        const tb = document.querySelector('.ant-table-body');
        if (tb) tb.scrollLeft = 0;
    })()""")
    
    # 2. Test Hamburger Drawer
    print("2. Testing Hamburger Drawer...")
    eval_js(ws, """(() => {
        const h = document.getElementById('sidemenu_hamburger_icon');
        const k = Object.keys(h).find(k => k.startsWith('__reactFiber'));
        let cur = h[k];
        while (cur) {
            if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
                cur.memoizedProps.toggleSideMenu();
                break;
            }
            cur = cur.return;
        }
    })()""")
    time.sleep(1.5)
    screencap("final_2_drawer_open.png")
    
    # 3. Navigate to Trip Manager
    print("3. Navigating to Trip Manager...")
    eval_js(ws, """(() => {
        const mask = document.querySelector('.ant-drawer-mask');
        if (mask) mask.click();
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
    screencap("final_3_trip_manager.png")
    
    # 4. Navigate to Rider Reconciliation
    print("4. Navigating to Rider Reconciliation List...")
    eval_js(ws, """(() => {
        const h = document.getElementById('sidemenu_hamburger_icon');
        const k = Object.keys(h).find(k => k.startsWith('__reactFiber'));
        let cur = h[k];
        while (cur) {
            if (cur.memoizedProps && cur.memoizedProps.history) {
                cur.memoizedProps.history.push('/reconciliation/rider-list');
                break;
            }
            cur = cur.return;
        }
    })()""")
    time.sleep(4)
    screencap("final_4_rider_list.png")
    
    # 5. Click first rider to navigate to individual reconciliation page
    print("5. Navigating to Individual Rider Recon...")
    eval_js(ws, """(() => {
        const firstRow = document.querySelector('.ant-table-tbody > tr:first-child');
        if (firstRow) {
            const link = firstRow.querySelector('a') || firstRow;
            link.click();
            return 'clicked';
        }
        return 'no row';
    })()""")
    time.sleep(4)
    screencap("final_5_rider_recon_detail.png")
    
    ws.close()
    print("All tests completed!")

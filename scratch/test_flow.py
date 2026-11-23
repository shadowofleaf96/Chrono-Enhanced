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
    
    # 1. Tap hamburger icon to open drawer
    print("1. Opening drawer...")
    res1 = eval_js(ws, """(() => {
        const btn = document.getElementById('sidemenu_hamburger_icon');
        if (btn) { btn.click(); return 'clicked hamburger'; }
        return 'no hamburger';
    })()""")
    print("Open drawer result:", res1)
    time.sleep(1.5)
    screencap("flow_1_drawer_open.png")
    
    # 2. Tap 'Consignments' / 'Consignment Dashboard'
    print("2. Clicking 'Consignment Dashboard'...")
    res2 = eval_js(ws, """(() => {
        const items = Array.from(document.querySelectorAll('.ant-drawer .ant-menu-item, .ant-drawer [role=\"menuitem\"], .ant-drawer a'));
        const target = items.find(el => el.innerText.includes('Consignment Dashboard') || el.innerText.includes('Consignments'));
        if (target) {
            target.click();
            return 'clicked ' + target.innerText;
        }
        return 'no item found: ' + items.map(i => i.innerText).join(', ');
    })()""")
    print("Click item result:", res2)
    time.sleep(3)
    screencap("flow_2_consignments.png")
    
    # 3. Check page state
    info = eval_js(ws, """(() => {
        return {
            url: location.href,
            title: document.title,
            isDrawerOpen: !!document.querySelector('.ant-drawer-open'),
            rows: document.querySelectorAll('.ant-table-tbody > tr').length
        };
    })()""")
    print("Page state after nav:", json.dumps(info, indent=2))
    ws.close()

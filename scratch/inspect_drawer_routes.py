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
    
    # 1. Close drawer if open
    eval_js(ws, "const m = document.querySelector('.ant-drawer-mask'); if (m) m.click();")
    
    # 2. Inspect side menu links
    menu_items = eval_js(ws, """(() => {
        const hamburger = document.getElementById('sidemenu_hamburger_icon');
        if (!hamburger) return 'no hamburger';
        const k = Object.keys(hamburger).find(k => k.startsWith('__reactFiber'));
        let cur = hamburger[k];
        let history = null;
        while (cur) {
            if (cur.memoizedProps && cur.memoizedProps.history) {
                history = cur.memoizedProps.history;
                break;
            }
            cur = cur.return;
        }
        return {
            historyPresent: !!history,
            currentLocation: history ? history.location : window.location.pathname
        };
    })()""")
    print("Router info:", menu_items)
    
    # Let's inspect the drawer navigation links by triggering drawer and reading DOM
    eval_js(ws, """(() => {
        const hamburger = document.getElementById('sidemenu_hamburger_icon');
        const k = Object.keys(hamburger).find(k => k.startsWith('__reactFiber'));
        let cur = hamburger[k];
        while (cur) {
            if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
                cur.memoizedProps.toggleSideMenu();
                break;
            }
            cur = cur.return;
        }
    })()""")
    time.sleep(1)
    
    drawer_links = eval_js(ws, """(() => {
        const links = [];
        document.querySelectorAll('.ant-drawer a, .ant-drawer [role="menuitem"], .ant-drawer .ant-menu-item').forEach(el => {
            links.push({
                text: el.innerText.trim(),
                href: el.getAttribute('href'),
                className: el.className
            });
        });
        return links;
    })()""")
    print("Drawer links count:", len(drawer_links) if isinstance(drawer_links, list) else drawer_links)
    if isinstance(drawer_links, list):
        for l in drawer_links[:15]:
            print(" -", l)
            
    # Close drawer
    eval_js(ws, "const m = document.querySelector('.ant-drawer-mask'); if (m) m.click();")
    ws.close()

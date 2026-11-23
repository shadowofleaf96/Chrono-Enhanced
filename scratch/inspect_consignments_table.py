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

if __name__ == "__main__":
    ws = get_ws()
    
    # Navigate to consignments
    eval_js(ws, """(() => {
        const h = document.getElementById('sidemenu_hamburger_icon');
        const k = Object.keys(h).find(k => k.startsWith('__reactFiber'));
        let cur = h[k];
        while (cur) {
            if (cur.memoizedProps && cur.memoizedProps.history) {
                cur.memoizedProps.history.push('/consignments');
                break;
            }
            cur = cur.return;
        }
    })()""")
    time.sleep(3)
    
    rows_info = eval_js(ws, """(() => {
        const rows = document.querySelectorAll('.ant-table-tbody > tr');
        return Array.from(rows).map((r, i) => {
            const rect = r.getBoundingClientRect();
            const cs = window.getComputedStyle(r);
            return {
                index: i,
                className: r.className,
                ariaHidden: r.getAttribute('aria-hidden'),
                height: rect.height,
                width: rect.width,
                top: rect.top,
                display: cs.display,
                visibility: cs.visibility,
                opacity: cs.opacity,
                text: r.innerText.replace(/\\s+/g, ' ').trim().substring(0, 100),
                cellsCount: r.querySelectorAll('td, th').length
            };
        });
    })()""")
    
    print("Consignments rows count:", len(rows_info) if isinstance(rows_info, list) else rows_info)
    if isinstance(rows_info, list):
        for r in rows_info:
            print(r)
            
    # Also check what container is wrapping .ant-table and whether table is overflow-hidden or pushed down
    layout_tree = eval_js(ws, """(() => {
        let el = document.querySelector('.ant-table');
        const path = [];
        while (el && el !== document.body) {
            const r = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            path.push({
                tag: el.tagName,
                id: el.id,
                className: el.className,
                rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) },
                overflow: cs.overflow,
                overflowY: cs.overflowY,
                heightStyle: el.style.height,
                computedHeight: cs.height,
                display: cs.display,
                flex: cs.flex
            });
            el = el.parentElement;
        }
        return path;
    })()""")
    print("\n--- Table Hierarchy ---")
    print(json.dumps(layout_tree, indent=2))
    
    ws.close()

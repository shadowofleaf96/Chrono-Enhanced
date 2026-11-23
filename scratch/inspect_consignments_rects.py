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
    
    # Check consignments DOM elements layout
    res = eval_js(ws, """(() => {
        function getRect(el) {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
                top: Math.round(r.top),
                bottom: Math.round(r.bottom),
                left: Math.round(r.left),
                right: Math.round(r.right),
                width: Math.round(r.width),
                height: Math.round(r.height),
                visible: r.width > 0 && r.height > 0 && window.getComputedStyle(el).display !== 'none'
            };
        }
        
        const table = document.querySelector('.ant-table');
        const tableBody = document.querySelector('.ant-table-body');
        const rows = document.querySelectorAll('.ant-table-tbody > tr');
        
        return {
            windowInnerHeight: window.innerHeight,
            windowInnerWidth: window.innerWidth,
            scrollY: window.scrollY,
            bodyScrollHeight: document.body.scrollHeight,
            header: getRect(document.querySelector('header')),
            tabs: getRect(document.querySelector('[class*="tabContainer-"]') || document.querySelector('.ant-tabs-nav')),
            filterToggle: getRect(document.getElementById('chrono-filter-toggle-btn')),
            filterSection: getRect(document.querySelector('[class*="filterWrapper-"]') || document.querySelector('[class*="collapsibleFilter-"]')),
            actionButtons: getRect(document.querySelector('[class*="actionGroup-"]') || document.querySelector('[class*="actions-"]')),
            table: getRect(table),
            tableBody: getRect(tableBody),
            rowsCount: rows.length,
            firstRow: rows.length > 0 ? getRect(rows[0]) : null,
            firstRowText: rows.length > 0 ? rows[0].innerText.replace(/\\n/g, ' ').substring(0, 80) : null
        };
    })()""")
    print("Consignments elements rects:")
    print(json.dumps(res, indent=2))
    
    ws.close()

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

if __name__ == "__main__":
    ws = get_ws()
    
    # Navigate to consignments
    eval_js(ws, """(() => {
        const nav = document.querySelector('[class*="navbar-"]') || document.querySelector('#root');
        let fiber = nav ? nav[Object.keys(nav).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))] : null;
        let cur = fiber;
        while (cur) {
            if (cur.memoizedProps && cur.memoizedProps.history) {
                cur.memoizedProps.history.push('/consignments');
                return;
            }
            cur = cur.return;
        }
        window.location.pathname = '/ops/consignments';
    })()""")
    time.sleep(3)
    
    info = eval_js(ws, """(() => {
        const table = document.querySelector('.ant-table');
        const rows = document.querySelectorAll('.ant-table-tbody > tr');
        const empty = document.querySelector('.ant-empty, .ant-table-placeholder');
        const spin = document.querySelector('.ant-spin');
        const pagination = document.querySelector('.ant-pagination');
        
        return {
            hasTable: !!table,
            tableRect: table ? table.getBoundingClientRect() : null,
            rowCount: rows.length,
            firstRowText: rows.length > 0 ? rows[0].innerText.substring(0, 100) : null,
            hasEmpty: !!empty,
            emptyText: empty ? empty.innerText : null,
            hasSpin: !!spin,
            hasPagination: !!pagination,
            paginationText: pagination ? pagination.innerText : null
        };
    })()""")
    print("Consignments table info:", json.dumps(info, indent=2))
    screencap("consignments_detail.png")

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
    
    # Click the toggle button to collapse filters
    eval_js(ws, """(() => {
        const btn = document.getElementById('chrono-filter-toggle-btn');
        if (btn) btn.click();
    })()""")
    
    time.sleep(1)
    screencap("preview_consignments_filters_collapsed.png")
    
    rects = eval_js(ws, """(() => {
        const table = document.querySelector('.ant-table');
        const r = table ? table.getBoundingClientRect() : null;
        return {
            tableRect: r ? { top: r.top, height: r.height, bottom: r.bottom } : null,
            visibleRows: document.querySelectorAll('.ant-table-tbody > tr').length
        };
    })()""")
    print("Collapsed state:", rects)
    ws.close()

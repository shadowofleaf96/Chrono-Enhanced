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
    
    # Hide filter wrapper completely
    eval_js(ws, """(() => {
        const fw = document.querySelector('[class*="filterBarWrapper-"]');
        if (fw) fw.style.setProperty('display', 'none', 'important');
        const mainDiv = document.querySelector('[class*="Ql-mainDiv-"]');
        if (mainDiv && mainDiv.children[0]) {
            mainDiv.children[0].style.setProperty('flex', '0 0 auto', 'important');
            mainDiv.children[0].style.setProperty('height', 'auto', 'important');
        }
        const tc = document.querySelector('[class*="Ql-tableContainer-"]');
        if (tc) {
            tc.style.setProperty('flex', '1 1 auto', 'important');
            tc.style.setProperty('height', '100%', 'important');
            tc.style.setProperty('display', 'flex', 'important');
        }
    })()""")
    
    time.sleep(1)
    screencap("consignments_after_c0_fix.png")
    
    res = eval_js(ws, """(() => {
        const table = document.querySelector('.ant-table');
        const r = table ? table.getBoundingClientRect() : null;
        return {
            tableRect: r ? { top: Math.round(r.top), height: Math.round(r.height), bottom: Math.round(r.bottom) } : null,
            visibleRows: document.querySelectorAll('.ant-table-tbody > tr').length
        };
    })()""")
    print("Consignments after fix:", res)
    ws.close()

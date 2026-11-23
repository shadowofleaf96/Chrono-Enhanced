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
    
    info = eval_js(ws, """(() => {
        const tb = document.querySelector('.ant-table-body') || document.querySelector('.ant-table-container');
        const tbl = document.querySelector('.ant-table table');
        const firstRowCells = Array.from(document.querySelectorAll('.ant-table-tbody > tr:nth-child(2) > td')).map((td, i) => {
            const r = td.getBoundingClientRect();
            return {
                i,
                className: td.className,
                left: Math.round(r.left),
                width: Math.round(r.width),
                text: td.innerText.substring(0, 30)
            };
        });
        
        return {
            tableBodyScrollLeft: tb ? tb.scrollLeft : null,
            tableBodyScrollWidth: tb ? tb.scrollWidth : null,
            tableWidth: tbl ? tbl.offsetWidth : null,
            firstRowCells: firstRowCells.slice(0, 10)
        };
    })()""")
    print("Table horizontal details:", json.dumps(info, indent=2))
    
    # Reset scrollLeft to 0 and screencap
    eval_js(ws, """(() => {
        document.querySelectorAll('.ant-table-body, .ant-table-container, .ant-table-header').forEach(el => {
            el.scrollLeft = 0;
        });
    })()""")
    time.sleep(1)
    screencap("consignments_scroll0.png")
    ws.close()

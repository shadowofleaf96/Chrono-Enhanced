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
    
    res = eval_js(ws, """(() => {
        let style = document.getElementById('test-consignments-full-fix');
        if (!style) {
            style = document.createElement('style');
            style.id = 'test-consignments-full-fix';
            document.head.appendChild(style);
        }
        style.textContent = `
            [class*="container-"] {
                display: flex !important;
                flex-direction: column !important;
                height: auto !important;
            }
            [class*="tabsContainer-"], .ant-tabs {
                flex: 0 0 auto !important;
                height: auto !important;
                max-height: 48px !important;
                margin: 0 !important;
            }
            [class*="tabDataContainer-"] {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                height: auto !important;
            }
            [class*="Ql-mainDiv-"], [class*="mainDiv-"] {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                height: auto !important;
                overflow: visible !important;
            }
            [class*="Ql-mainDiv-"] > div:first-child {
                flex: 0 0 auto !important;
                height: auto !important;
            }
            [class*="searchUploadDiv-"],
            [class*="searchUploadDiv-"] > div,
            [class*="actionsBar-"],
            [class*="actionBar-"] {
                height: auto !important;
                max-height: 52px !important;
                min-height: 0 !important;
                flex: 0 0 auto !important;
            }
            [class*="Ql-tableContainer-"], [class*="tableContainer-"] {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                height: auto !important;
                min-height: 400px !important;
                overflow: visible !important;
            }
            [class*="tableParent-"] {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                height: auto !important;
            }
            .ant-table-wrapper, .ant-spin-nested-loading, .ant-spin-container, .ant-table {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                height: auto !important;
            }
            .ant-table-body {
                overflow-x: auto !important;
                overflow-y: visible !important;
                height: auto !important;
                max-height: none !important;
            }
        `;
        
        const tbl = document.querySelector('.ant-table');
        const r = tbl ? tbl.getBoundingClientRect() : null;
        return {
            tableTop: r ? Math.round(r.top) : null,
            tableHeight: r ? Math.round(r.height) : null,
            tableBottom: r ? Math.round(r.bottom) : null
        };
    })()""")
    print("Table position after searchUploadDiv height fix:", res)
    time.sleep(1)
    screencap("consignments_TABLE_VISIBLE_FINALLY.png")
    ws.close()

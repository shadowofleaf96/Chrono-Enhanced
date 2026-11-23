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

if __name__ == "__main__":
    ws = get_ws()
    info = eval_js(ws, """(() => {
        const table = document.querySelector('.ant-table');
        const tableWrapper = document.querySelector('.ant-table-wrapper');
        const rows = document.querySelectorAll('.ant-table-tbody > tr');
        
        let parents = [];
        let cur = table;
        while (cur && cur !== document.body) {
            const r = cur.getBoundingClientRect();
            parents.push({
                tag: cur.tagName,
                cls: cur.className,
                id: cur.id,
                rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) },
                overflow: window.getComputedStyle(cur).overflow,
                display: window.getComputedStyle(cur).display,
                visibility: window.getComputedStyle(cur).visibility,
                opacity: window.getComputedStyle(cur).opacity,
                height: window.getComputedStyle(cur).height
            });
            cur = cur.parentElement;
        }

        return {
            windowInnerHeight: window.innerHeight,
            bodyScrollHeight: document.body.scrollHeight,
            hasTable: !!table,
            rowCount: rows.length,
            tableRect: table ? table.getBoundingClientRect() : null,
            parents
        };
    })()""")
    print(json.dumps(info, indent=2))

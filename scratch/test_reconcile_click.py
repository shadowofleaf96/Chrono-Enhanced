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
    
    # Click 'Reconcile' link
    res = eval_js(ws, """(() => {
        const links = Array.from(document.querySelectorAll('a, button, span')).filter(el => el.innerText && el.innerText.trim() === 'Reconcile');
        if (links.length > 0) {
            links[0].click();
            return 'clicked Reconcile';
        }
        return 'no reconcile link';
    })()""")
    print("Click result:", res)
    time.sleep(4)
    screencap("recon_detail_page.png")
    
    info = eval_js(ws, """(() => {
        return {
            url: location.href,
            title: document.title,
            inputs: document.querySelectorAll('input').length,
            tables: document.querySelectorAll('.ant-table').length
        };
    })()""")
    print("Recon detail page info:", info)
    ws.close()

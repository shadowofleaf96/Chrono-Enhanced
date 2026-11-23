import subprocess, json, urllib.request
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
    res = eval_js(ws, """(() => {
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(s => s.id || s.tagName);
        const hasMobileCss = !!document.getElementById('chrono-mobile-css');
        const trackIcon = document.querySelector('[class*="trackIcon-"]');
        const bell = document.querySelector('[class*="notificationIcon-"]');
        const profile = document.querySelector('[class*="profileTriggerButton"]');
        
        return {
            hasMobileCss,
            trackIconDisplay: trackIcon ? window.getComputedStyle(trackIcon).display : 'not found',
            bellDisplay: bell ? window.getComputedStyle(bell).display : 'not found',
            profileDisplay: profile ? window.getComputedStyle(profile).display : 'not found',
            stylesCount: styles.length
        };
    })()""")
    print(json.dumps(res, indent=2))

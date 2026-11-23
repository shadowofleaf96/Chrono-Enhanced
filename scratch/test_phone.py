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
    
    # 1. Inspect current page navbar & tools
    info = eval_js(ws, """(() => {
        const nav = document.querySelector('[class*="navbar-"]');
        if (!nav) return { error: 'No navbar' };
        
        const tools = nav.querySelector('[class*="filterGroupToolsRight-"]');
        let toolsInfo = [];
        if (tools) {
            toolsInfo = Array.from(tools.children).map(c => ({
                tag: c.tagName,
                cls: c.className,
                text: c.innerText ? c.innerText.trim().replace(/\\n/g, ' ') : '',
                html: c.outerHTML.substring(0, 200),
                rect: c.getBoundingClientRect(),
                styleWidth: window.getComputedStyle(c).width,
                flex: window.getComputedStyle(c).flex
            }));
        }
        
        const leftDiv = nav.querySelector('[class*="leftDiv-"]');
        let leftInfo = null;
        if (leftDiv) {
            leftInfo = {
                rect: leftDiv.getBoundingClientRect(),
                children: Array.from(leftDiv.children).map(c => ({
                    tag: c.tagName,
                    cls: c.className,
                    text: c.innerText ? c.innerText.trim() : '',
                    rect: c.getBoundingClientRect()
                }))
            };
        }

        return {
            navRect: nav.getBoundingClientRect(),
            navChildren: Array.from(nav.children).map(c => ({
                tag: c.tagName,
                cls: c.className,
                rect: c.getBoundingClientRect()
            })),
            leftInfo,
            toolsInfo
        };
    })()""")
    
    print("=== NAVBAR INFO ===")
    print(json.dumps(info, indent=2))

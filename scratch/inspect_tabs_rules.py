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
    
    info = eval_js(ws, """(() => {
        const tabs = document.querySelector('.tabsContainer-0-3-333') || document.querySelector('.tabs-0-3-339');
        if (!tabs) return 'no tabs';
        
        // Find which stylesheets have rules for tabs
        const matchingRules = [];
        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules) {
                    if (rule.selectorText && (rule.selectorText.includes('tabs') || rule.selectorText.includes('ant-tabs'))) {
                        if (tabs.matches(rule.selectorText)) {
                            matchingRules.push({
                                selector: rule.selectorText,
                                height: rule.style.height,
                                minHeight: rule.style.minHeight,
                                flex: rule.style.flex,
                                padding: rule.style.padding,
                                margin: rule.style.margin,
                                sheetHref: sheet.href || 'inline'
                            });
                        }
                    }
                }
            } catch(e) {}
        }
        
        return {
            matchingRules,
            parent: {
                tag: tabs.parentElement.tagName,
                className: tabs.parentElement.className,
                display: window.getComputedStyle(tabs.parentElement).display,
                flexDirection: window.getComputedStyle(tabs.parentElement).flexDirection
            }
        };
    })()""")
    print("Tabs matching rules:")
    print(json.dumps(info, indent=2))
    ws.close()

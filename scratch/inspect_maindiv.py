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
    info = eval_js(ws, """(() => {
        const el = document.querySelector('[class*="mainDiv-0-3-190"]') || document.querySelector('[class*="tableContainer-"]');
        const container = document.querySelector('[class*="tableContainer-"]');
        
        function getStyles(elem) {
            if (!elem) return null;
            let rules = [];
            for (let s of document.styleSheets) {
                try {
                    for (let r of s.cssRules) {
                        if (r.selectorText && elem.matches(r.selectorText)) {
                            rules.push({ src: s.ownerNode ? s.ownerNode.id : s.href, text: r.cssText });
                        }
                    }
                } catch(e) {}
            }
            return {
                styleAttr: elem.getAttribute('style'),
                computedHeight: window.getComputedStyle(elem).height,
                computedFlex: window.getComputedStyle(elem).flex,
                computedOverflow: window.getComputedStyle(elem).overflow,
                rules
            };
        }

        return {
            mainDivStyles: getStyles(document.querySelector('[class*="mainDiv-0-3-190"]')),
            tableContainerStyles: getStyles(container)
        };
    })()""")
    print(json.dumps(info, indent=2))

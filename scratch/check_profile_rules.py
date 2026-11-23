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
        const styleTag = document.getElementById('chrono-mobile-responsive');
        const profile = document.querySelector('[class*="profileTriggerButton"]');
        
        let matchingRules = [];
        if (styleTag && styleTag.sheet) {
            try {
                for (let r of styleTag.sheet.cssRules) {
                    if (r.selectorText && profile && profile.matches(r.selectorText)) {
                        matchingRules.push(r.cssText);
                    }
                }
            } catch(e) { matchingRules.push('sheet error: ' + e.message); }
        }
        
        // Find ALL matching rules in document for profile
        let allRules = [];
        for (let s of document.styleSheets) {
            try {
                for (let r of s.cssRules) {
                    if (r.selectorText && profile && profile.matches(r.selectorText)) {
                        allRules.push({ href: s.href || s.ownerNode.id, rule: r.cssText });
                    }
                }
            } catch(e) {}
        }
        
        return {
            hasStyleTag: !!styleTag,
            styleLength: styleTag ? styleTag.textContent.length : 0,
            profileHtml: profile ? profile.outerHTML : null,
            matchingRules,
            allRules
        };
    })()""")
    print(json.dumps(res, indent=2))

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
    
    test_css = """
    /* Test Single-Row Clean Navbar */
    [class*="navbar-"] {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: flex-start !important;
        height: 46px !important;
        min-height: 46px !important;
        max-height: 46px !important;
        padding: 4px 8px !important;
        gap: 6px !important;
        background: #0088CE !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        width: 100vw !important;
        max-width: 100vw !important;
    }
    
    [class*="leftDiv-"] {
        display: inline-flex !important;
        align-items: center !important;
        flex: 0 0 auto !important;
        width: auto !important;
        min-width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
    }
    
    /* Hide duplicate page title because native toolbar already shows it cleanly */
    [class*="pageTitle-"] {
        display: none !important;
    }
    
    #sidemenu_hamburger_icon, [id*="hamburger"] {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 36px !important;
        height: 36px !important;
        min-width: 36px !important;
        min-height: 36px !important;
        border-radius: 8px !important;
        background: rgba(255, 255, 255, 0.22) !important;
        border: 1px solid rgba(255, 255, 255, 0.3) !important;
        cursor: pointer !important;
        padding: 6px !important;
        box-sizing: border-box !important;
    }
    
    #sidemenu_hamburger_icon svg, [id*="hamburger"] svg {
        width: 20px !important;
        height: 20px !important;
        fill: #ffffff !important;
    }
    
    [class*="filterGroupToolsRight-"] {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        align-items: center !important;
        flex: 1 1 auto !important;
        min-width: 0 !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        gap: 6px !important;
        margin: 0 !important;
        padding: 0 !important;
        height: 100% !important;
    }
    [class*="filterGroupToolsRight-"]::-webkit-scrollbar {
        display: none !important;
    }
    
    /* Compact tools styling */
    [class*="toolContainer-"] {
        display: inline-flex !important;
        align-items: center !important;
        flex: 0 0 auto !important;
        height: 32px !important;
    }
    
    [class*="toolContainer-"] .ant-select {
        font-size: 11px !important;
    }
    
    [class*="toolContainer-"] .ant-select-selection {
        height: 32px !important;
        border-radius: 6px !important;
        padding: 0 6px !important;
        display: flex !important;
        align-items: center !important;
    }
    
    [class*="toolContainer-"] input {
        height: 32px !important;
        font-size: 11px !important;
        border-radius: 6px !important;
    }
    
    [class*="toolContainer-"] .ant-input-search {
        max-width: 160px !important;
    }
    
    [class*="toolContainer-"] .ant-picker {
        height: 32px !important;
        max-width: 150px !important;
        font-size: 11px !important;
        border-radius: 6px !important;
    }
    """
    
    escaped = test_css.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")
    eval_js(ws, f"""(() => {{
        let s = document.getElementById('test-single-row-navbar');
        if (!s) {{
            s = document.createElement('style');
            s.id = 'test-single-row-navbar';
            document.head.appendChild(s);
        }}
        s.textContent = '{escaped}';
    }})()""")
    
    time.sleep(1)
    screencap("preview_navbar_single_row.png")
    ws.close()
    print("Preview captured!")

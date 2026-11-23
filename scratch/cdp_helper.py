import json
import subprocess
import urllib.request
import websocket

def get_page_ws():
    res = subprocess.check_output(['adb', 'shell', 'grep -a webview /proc/net/unix'], text=True)
    socket_name = None
    for line in res.splitlines():
        if '@webview_devtools_remote_' in line:
            socket_name = line.split('@')[-1].strip()
            break
    if not socket_name:
        raise Exception("No webview socket found")
    subprocess.run(['adb', 'forward', 'tcp:9223', f'localabstract:{socket_name}'], check=True)
    req = urllib.request.urlopen('http://127.0.0.1:9223/json')
    targets = json.loads(req.read().decode('utf-8'))
    for t in targets:
        if t.get('type') == 'page':
            return t.get('webSocketDebuggerUrl')
    raise Exception("No page target found")

def eval_js(js_code):
    ws_url = get_page_ws()
    ws = websocket.create_connection(ws_url, suppress_origin=True)
    msg = {
        "id": 1,
        "method": "Runtime.evaluate",
        "params": {
            "expression": js_code,
            "returnByValue": True,
            "awaitPromise": True
        }
    }
    ws.send(json.dumps(msg))
    resp = json.loads(ws.recv())
    ws.close()
    if 'exceptionDetails' in resp.get('result', {}):
        return f"EXCEPTION: {resp['result']['exceptionDetails']}"
    if 'error' in resp:
        return {'error': resp['error']}
    return resp.get('result', {}).get('result', {}).get('value')

if __name__ == '__main__':
    import sys
    code = sys.argv[1] if len(sys.argv) > 1 else 'document.title'
    print(eval_js(code))

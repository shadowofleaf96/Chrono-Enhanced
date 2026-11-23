import urllib.request
import json
import websocket

def get_page():
    req = urllib.request.urlopen('http://localhost:9223/json')
    data = json.loads(req.read().decode())
    return data[0]['webSocketDebuggerUrl']

ws_url = get_page()
ws = websocket.create_connection(ws_url)

def cdp_eval(expr):
    payload = {
        "id": 1,
        "method": "Runtime.evaluate",
        "params": {
            "expression": expr,
            "returnByValue": True
        }
    }
    ws.send(json.dumps(payload))
    res = json.loads(ws.recv())
    return res.get('result', {}).get('result', {}).get('value')

print("URL:", cdp_eval("window.location.href"))
ws.close()

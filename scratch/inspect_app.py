import socket
import json
import subprocess
import time

def main():
    proc = subprocess.run(["adb", "shell", "cat /proc/net/unix"], capture_output=True, text=True)
    socket_name = None
    for line in proc.stdout.splitlines():
        if "webview_devtools_remote" in line:
            socket_name = line.split("@")[-1].strip()
            break
    print("Found socket:", socket_name)
    if not socket_name:
        return

    port = 9225
    subprocess.run(["adb", "forward", f"tcp:{port}", f"localabstract:{socket_name}"], check=True)
    time.sleep(0.5)

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5)
    s.connect(("127.0.0.1", port))
    s.sendall(b"GET /json/list HTTP/1.1\r\nHost: localhost:9225\r\n\r\n")
    
    data = b""
    while True:
        try:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
            if b"\r\n\r\n" in data and (b"]" in data or b"}" in data):
                break
        except socket.timeout:
            break
    s.close()
    
    header, _, body = data.partition(b"\r\n\r\n")
    print("Header:", header.decode(errors="replace")[:200])
    try:
        pages = json.loads(body.decode(errors="replace"))
        print(f"Pages ({len(pages)}):")
        for p in pages:
            print("Title:", p.get("title"))
            print("URL:", p.get("url"))
            print("WS:", p.get("webSocketDebuggerUrl"))
    except Exception as e:
        print("Body parse error:", e, "Raw body length:", len(body))

if __name__ == "__main__":
    main()

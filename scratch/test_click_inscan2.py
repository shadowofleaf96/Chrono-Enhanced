import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js
import json

# Click tab 1
eval_js("document.querySelectorAll('.ant-tabs-tab')[1].click();")
time.sleep(1)

# Now check if inscanBtn exists and click it
res = eval_js("""
(() => {
    const inscanBtn = document.querySelector('.chrono-inscan-ext-btn');
    if (!inscanBtn) return { error: "Inscan button not found even after wait" };
    inscanBtn.click();
    return { clicked: true, inscanBtnText: inscanBtn.innerText };
})()
""")
print("Click result:", res)

# Wait 3 seconds
time.sleep(3)

inspect_js = """
(() => {
    const overlay = document.querySelector('.chrono-iframe-overlay');
    const iframe = document.querySelector('#chrono-inscan-iframe');
    const loading = document.querySelector('.chrono-iframe-loading');

    let iframeInfo = null;
    if (iframe) {
        try {
            const idoc = iframe.contentDocument;
            const modal = idoc ? idoc.querySelector('.ant-modal-content') : null;
            iframeInfo = {
                src: iframe.src,
                hasDoc: !!idoc,
                modalFound: !!modal,
                docTitle: idoc ? idoc.title : null,
                bodyLength: idoc ? idoc.body.innerHTML.length : 0,
                docUrl: idoc ? idoc.location.href : null,
                docButtons: idoc ? Array.from(idoc.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean) : []
            };
        } catch(e) {
            iframeInfo = { error: e.toString() };
        }
    }

    return {
        overlay: overlay ? {
            style: overlay.getAttribute('style'),
            computedDisplay: window.getComputedStyle(overlay).display,
            computedOpacity: window.getComputedStyle(overlay).opacity,
            computedZIndex: window.getComputedStyle(overlay).zIndex,
            computedWidth: window.getComputedStyle(overlay).width,
            computedHeight: window.getComputedStyle(overlay).height,
            ready: overlay.dataset.ready
        } : null,
        loadingText: loading ? loading.innerText : null,
        loadingDisplay: loading ? window.getComputedStyle(loading).display : null,
        iframe: iframeInfo
    };
})()
"""
res2 = eval_js(inspect_js)
print(json.dumps(res2, indent=2))

subprocess.run(['adb', 'shell', 'screencap -p /sdcard/inscan_click_screen2.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/inscan_click_screen2.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\inscan_click_screen2.png'], check=True)

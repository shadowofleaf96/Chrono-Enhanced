import sys
import subprocess
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    let style = document.getElementById('test-overlay-style');
    if (!style) {
        style = document.createElement('style');
        style.id = 'test-overlay-style';
        document.head.appendChild(style);
    }
    style.textContent = `
      .chrono-iframe-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 999999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(0, 0, 0, 0.5) !important;
        transition: opacity 0.2s ease !important;
      }
      .chrono-iframe-loading {
        position: absolute !important;
        background: #ffffff !important;
        padding: 16px 28px !important;
        border-radius: 10px !important;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25) !important;
        font-size: 15px !important;
        font-weight: 700 !important;
        color: #1890ff !important;
        z-index: 10 !important;
      }
      #chrono-inscan-iframe {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        border: none !important;
        opacity: 1 !important;
        background: transparent !important;
      }
    `;

    const iframe = document.querySelector('#chrono-inscan-iframe');
    const idoc = iframe ? iframe.contentDocument : null;
    let modalInfo = null;
    if (idoc) {
        // Also inject modal responsiveness inside iframe
        let istyle = idoc.getElementById('test-iframe-responsive');
        if (!istyle) {
            istyle = idoc.createElement('style');
            istyle.id = 'test-iframe-responsive';
            idoc.head.appendChild(istyle);
        }
        istyle.textContent = `
          .ant-modal-mask { background: transparent !important; }
          .ant-modal-wrap { 
            position: fixed !important;
            inset: 0 !important;
            z-index: 1000 !important; 
            overflow-y: auto !important; 
            padding: 8px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .ant-modal { 
            width: 95vw !important; 
            max-width: 95vw !important; 
            margin: auto !important; 
            top: 0 !important;
            padding-bottom: 0 !important;
          }
          .ant-modal-content { 
            border-radius: 12px !important; 
            max-height: 94vh !important; 
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important; 
          }
          .ant-modal-header {
            padding: 14px 16px !important;
            border-bottom: 1px solid #f0f0f0 !important;
          }
          .ant-modal-body { 
            max-height: calc(94vh - 120px) !important; 
            overflow-y: auto !important; 
            padding: 12px 14px !important; 
          }
          .ant-modal-footer {
            padding: 10px 16px !important;
            border-top: 1px solid #f0f0f0 !important;
          }
          .ant-table-wrapper { width: 100% !important; overflow-x: auto !important; }
        `;

        const modal = idoc.querySelector('.ant-modal');
        if (modal) {
            modalInfo = {
                width: modal.offsetWidth,
                height: modal.offsetHeight,
                rect: modal.getBoundingClientRect()
            };
        }
    }

    return {
        applied: true,
        modalInfo: modalInfo
    };
})()
"""

res = eval_js(js)
print("Result:", json.dumps(res, indent=2))

subprocess.run(['adb', 'shell', 'screencap -p /sdcard/live_inscan_overlay.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/live_inscan_overlay.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\live_inscan_overlay.png'], check=True)

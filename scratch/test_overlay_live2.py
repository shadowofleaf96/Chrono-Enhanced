import sys
import subprocess
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    const iframe = document.querySelector('#chrono-inscan-iframe');
    const idoc = iframe ? iframe.contentDocument : null;
    if (!idoc) return 'no idoc';

    let istyle = idoc.getElementById('chrono-iframe-style-enhanced');
    if (!istyle) {
        istyle = idoc.createElement('style');
        istyle.id = 'chrono-iframe-style-enhanced';
        idoc.head.appendChild(istyle);
    }
    istyle.textContent = `
      #root { display: none !important; }
      body { background: transparent !important; overflow: hidden !important; }
      .ant-modal-mask { background: rgba(0, 0, 0, 0.5) !important; }
      .ant-modal-wrap { 
        position: fixed !important;
        inset: 0 !important;
        z-index: 1000 !important; 
        overflow-y: auto !important; 
        padding: 10px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      .ant-modal { 
        width: 96vw !important; 
        max-width: 440px !important; 
        margin: auto !important; 
        top: 0 !important;
        padding-bottom: 0 !important;
      }
      .ant-modal-content { 
        border-radius: 14px !important; 
        max-height: 90vh !important; 
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important; 
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35) !important;
      }
      .ant-modal-header {
        padding: 14px 16px !important;
        border-bottom: 1px solid #f0f0f0 !important;
      }
      .ant-modal-title {
        font-size: 17px !important;
        font-weight: 700 !important;
        color: #1e293b !important;
      }
      .ant-modal-close {
        top: 10px !important;
        right: 10px !important;
        width: 36px !important;
        height: 36px !important;
      }
      .ant-modal-close-x {
        width: 36px !important;
        height: 36px !important;
        line-height: 36px !important;
        font-size: 16px !important;
      }
      .ant-modal-body { 
        max-height: calc(90vh - 130px) !important; 
        overflow-y: auto !important; 
        padding: 14px !important; 
      }
      .ant-modal-footer {
        padding: 10px 16px !important;
        border-top: 1px solid #f0f0f0 !important;
        display: flex !important;
        justify-content: flex-end !important;
        gap: 8px !important;
      }
      .ant-modal-footer button {
        min-height: 38px !important;
        padding: 0 18px !important;
        border-radius: 6px !important;
        font-weight: 600 !important;
        font-size: 14px !important;
      }

      /* Scan input field styling */
      input[placeholder*="Add consignments"],
      input[placeholder*="consignments"] {
        height: 44px !important;
        font-size: 15px !important;
        border-radius: 8px !important;
        border: 1.5px solid #0088ce !important;
      }

      /* Import Excel button */
      .chrono-ext-import-btn,
      button.chrono-ext-import-btn {
        margin-top: 8px !important;
        margin-bottom: 8px !important;
        height: 36px !important;
        font-size: 13px !important;
        border-radius: 6px !important;
      }

      /* Modal table styling */
      .ant-table-wrapper { 
        width: 100% !important; 
        overflow-x: auto !important; 
        margin-top: 8px !important;
      }
      .ant-table {
        font-size: 13px !important;
      }
      .ant-table th, .ant-table td {
        padding: 8px 6px !important;
      }
    `;

    return 'applied';
})()
"""

res = eval_js(js)
print("Result:", res)

subprocess.run(['adb', 'shell', 'screencap -p /sdcard/live_modal_clean.png'], check=True)
subprocess.run(['adb', 'pull', '/sdcard/live_modal_clean.png', r'C:\Users\simok\.gemini\antigravity\brain\aa9b9a48-0644-4e2e-aaff-48e5eb4937de\live_modal_clean.png'], check=True)

from cdp_helper import eval_js
import json

js = """
(() => {
    const modal = document.querySelector('.ant-modal-content');
    const input = modal?.querySelector('input[placeholder*="Add consignments"], input[placeholder*="CN"]');
    const btn = modal?.querySelector('.chrono-ext-import-btn');
    const footerBtns = Array.from(modal?.querySelectorAll('.ant-modal-footer button') || []);
    
    return {
        modalTitle: modal?.querySelector('.ant-modal-title')?.textContent?.trim(),
        inputWidth: input ? window.getComputedStyle(input).width : null,
        inputHeight: input ? window.getComputedStyle(input).height : null,
        btnWidth: btn ? window.getComputedStyle(btn).width : null,
        btnHeight: btn ? window.getComputedStyle(btn).height : null,
        footerBtns: footerBtns.map(b => ({
            text: b.textContent.trim(),
            width: window.getComputedStyle(b).width,
            height: window.getComputedStyle(b).height
        }))
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

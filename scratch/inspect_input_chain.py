from cdp_helper import eval_js
import json

js = """
(() => {
    const modal = document.querySelector('.ant-modal-content');
    const input = modal?.querySelector('input[placeholder*="Add consignments"], input[placeholder*="CN"]');
    if (!input) return "Input not found";
    
    let cur = input;
    const chain = [];
    while (cur && !cur.classList.contains('ant-modal-body')) {
        chain.push({
            tag: cur.tagName,
            class: cur.className,
            style: cur.getAttribute('style'),
            computed: {
                width: window.getComputedStyle(cur).width,
                display: window.getComputedStyle(cur).display,
                flex: window.getComputedStyle(cur).flex
            }
        });
        cur = cur.parentElement;
    }
    return chain;
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

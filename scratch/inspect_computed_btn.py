import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js
import json

js = """
(() => {
    // switch to tab 1
    document.querySelectorAll('.ant-tabs-tab')[1].click();

    const btn = document.querySelector('.chrono-inscan-ext-btn');
    if (!btn) return "no inscan btn";

    const parent = btn.parentElement;
    return {
        btn: {
            display: window.getComputedStyle(btn).display,
            width: window.getComputedStyle(btn).width,
            flex: window.getComputedStyle(btn).flex,
            margin: window.getComputedStyle(btn).margin
        },
        parent: {
            tag: parent.tagName,
            cls: parent.className,
            display: window.getComputedStyle(parent).display,
            flexWrap: window.getComputedStyle(parent).flexWrap,
            width: window.getComputedStyle(parent).width
        }
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

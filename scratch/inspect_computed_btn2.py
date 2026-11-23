import sys
import time
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js
import json

js = """
(() => {
    document.querySelectorAll('.ant-tabs-tab')[1].click();
    return new Promise(resolve => {
        setTimeout(() => {
            const btn = document.querySelector('.chrono-inscan-ext-btn');
            if (!btn) return resolve("still no btn");
            const parent = btn.parentElement;
            resolve({
                btn: {
                    className: btn.className,
                    display: window.getComputedStyle(btn).display,
                    width: window.getComputedStyle(btn).width,
                    flex: window.getComputedStyle(btn).flex,
                    rect: btn.getBoundingClientRect()
                },
                parent: {
                    className: parent.className,
                    display: window.getComputedStyle(parent).display,
                    flexWrap: window.getComputedStyle(parent).flexWrap,
                    width: window.getComputedStyle(parent).width,
                    rect: parent.getBoundingClientRect()
                }
            });
        }, 600);
    });
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

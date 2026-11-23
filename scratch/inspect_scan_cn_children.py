from cdp_helper import eval_js
import json

js = """
(() => {
    const scanCN = document.querySelector('[class*="Component-scanCN-"]');
    if (!scanCN) return null;
    return Array.from(scanCN.children).map(c => ({
        tag: c.tagName,
        class: c.className,
        style: c.getAttribute('style'),
        computed: {
            display: window.getComputedStyle(c).display,
            width: window.getComputedStyle(c).width,
            float: window.getComputedStyle(c).float
        },
        rect: {
            top: Math.round(c.getBoundingClientRect().top),
            bottom: Math.round(c.getBoundingClientRect().bottom),
            height: Math.round(c.getBoundingClientRect().height),
            width: Math.round(c.getBoundingClientRect().width)
        },
        text: c.textContent.trim().slice(0, 30)
    }));
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

from cdp_helper import eval_js
import json

js = """
(() => {
    const parent = document.querySelector('.ant-modal-body > div');
    if (!parent) return null;
    return Array.from(parent.children).map(c => ({
        tag: c.tagName,
        class: c.className,
        style: c.getAttribute('style'),
        computed: {
            display: window.getComputedStyle(c).display,
            width: window.getComputedStyle(c).width
        },
        rect: {
            top: Math.round(c.getBoundingClientRect().top),
            bottom: Math.round(c.getBoundingClientRect().bottom),
            height: Math.round(c.getBoundingClientRect().height),
            width: Math.round(c.getBoundingClientRect().width)
        },
        text: c.textContent.trim().slice(0, 40)
    }));
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

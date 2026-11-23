from cdp_helper import eval_js
import json

js = """
(() => {
    const modalBody = document.querySelector('.ant-modal-body');
    if (!modalBody) return null;
    return Array.from(modalBody.children).map(c => ({
        tag: c.tagName,
        class: c.className,
        style: c.getAttribute('style'),
        computed: {
            display: window.getComputedStyle(c).display,
            width: window.getComputedStyle(c).width,
            flexDirection: window.getComputedStyle(c).flexDirection
        },
        rect: {
            top: Math.round(c.getBoundingClientRect().top),
            bottom: Math.round(c.getBoundingClientRect().bottom),
            height: Math.round(c.getBoundingClientRect().height),
            width: Math.round(c.getBoundingClientRect().width)
        },
        text: c.textContent.trim().slice(0, 50)
    }));
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

from cdp_helper import eval_js
import json

js = """
(() => {
    const wrapper = document.querySelector('.defaultInput-0-3-93') || document.querySelector('.ant-input-group-wrapper');
    if (!wrapper) return null;
    return Array.from(wrapper.children).map(c => ({
        tag: c.tagName,
        class: c.className,
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
        children: Array.from(c.children).map(cc => ({
            tag: cc.tagName,
            class: cc.className,
            rect: {
                top: Math.round(cc.getBoundingClientRect().top),
                bottom: Math.round(cc.getBoundingClientRect().bottom),
                height: Math.round(cc.getBoundingClientRect().height),
                width: Math.round(cc.getBoundingClientRect().width)
            },
            computed: {
                display: window.getComputedStyle(cc).display,
                width: window.getComputedStyle(cc).width,
                flex: window.getComputedStyle(cc).flex
            },
            text: cc.textContent.trim().slice(0, 30)
        }))
    }));
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

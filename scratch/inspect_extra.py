from cdp_helper import eval_js
import json

js = """
(() => {
    const tabsExtra = document.querySelector('.ant-tabs-extra-content');
    if (!tabsExtra) return null;
    return {
        className: tabsExtra.className,
        style: tabsExtra.getAttribute('style'),
        computed: {
            width: window.getComputedStyle(tabsExtra).width,
            flex: window.getComputedStyle(tabsExtra).flex,
            display: window.getComputedStyle(tabsExtra).display
        },
        children: Array.from(tabsExtra.children).map(c => ({
            tag: c.tagName,
            class: c.className,
            style: c.getAttribute('style'),
            width: window.getComputedStyle(c).width
        }))
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

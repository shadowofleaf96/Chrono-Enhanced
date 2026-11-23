from cdp_helper import eval_js
import json

js = """
(() => {
    const group = document.querySelector('.ant-input-wrapper.ant-input-group');
    if (!group) return null;
    return Array.from(group.children).map(c => ({
        tag: c.tagName,
        class: c.className,
        rect: c.getBoundingClientRect(),
        computed: {
            width: window.getComputedStyle(c).width,
            flex: window.getComputedStyle(c).flex
        }
    }));
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

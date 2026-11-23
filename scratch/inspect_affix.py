from cdp_helper import eval_js
import json

js = """
(() => {
    const el = document.querySelector('.ant-modal .ant-input-affix-wrapper');
    if (!el) return null;
    return {
        inlineStyle: el.getAttribute('style'),
        className: el.className,
        parentTag: el.parentElement.tagName,
        parentClass: el.parentElement.className,
        parentStyle: el.parentElement.getAttribute('style'),
        computed: {
            width: window.getComputedStyle(el).width,
            flex: window.getComputedStyle(el).flex,
            minWidth: window.getComputedStyle(el).minWidth,
            maxWidth: window.getComputedStyle(el).maxWidth
        }
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

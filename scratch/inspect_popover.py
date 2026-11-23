from cdp_helper import eval_js
import json

js = """
(() => {
    return Array.from(document.querySelectorAll('.ant-popover, .ant-tooltip, [role="menu"], [class*="popover"], [class*="dropdown"]')).map(el => ({
        tag: el.tagName,
        class: el.className,
        text: el.textContent.trim(),
        visible: el.offsetParent !== null
    }));
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

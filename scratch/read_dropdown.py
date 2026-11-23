from cdp_helper import eval_js
import json

js = """
(() => {
    return Array.from(document.querySelectorAll('.ant-dropdown-menu-item, [role="menuitem"]')).map(e => e.textContent.trim());
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

from cdp_helper import eval_js
import json

js = """
(() => {
    const item = Array.from(document.querySelectorAll('.ant-dropdown-menu-item, [role="menuitem"]')).find(e => e.textContent.trim() === 'Selected');
    if (item) {
        item.click();
        return "Clicked Selected";
    }
    return "Selected not found";
})()
"""

res = eval_js(js)
print(res)

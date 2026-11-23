from cdp_helper import eval_js
import json

js = """
(() => {
    const actionsBtn = Array.from(document.querySelectorAll('button, div')).find(el => el.textContent.trim() === 'Actions' && el.classList.contains('ant-dropdown-trigger'));
    if (actionsBtn) {
        actionsBtn.click();
        return "Clicked Actions dropdown";
    }
    return "Actions dropdown button not found";
})()
"""

res = eval_js(js)
print(res)

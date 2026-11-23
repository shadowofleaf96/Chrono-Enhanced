from cdp_helper import eval_js
import json

js = """
(() => {
    const outscanBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase().includes('outscan'));
    if (outscanBtn) {
        outscanBtn.click();
        return "Clicked Outscan";
    }
    return "Not found";
})()
"""

res = eval_js(js)
print(res)

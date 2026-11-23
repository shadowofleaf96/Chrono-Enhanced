from cdp_helper import eval_js
import json

js = """
(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase() === 'arrival');
    if (btn) {
        btn.click();
        return "Clicked Arrival";
    }
    return "Arrival button not found";
})()
"""

res = eval_js(js)
print(res)

from cdp_helper import eval_js
import json

js = """
(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Règlements'));
    if (btn) {
        btn.click();
        return "Clicked Reglements button";
    }
    return "Not found";
})()
"""

res = eval_js(js)
print(res)

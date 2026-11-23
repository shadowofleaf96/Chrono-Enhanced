from cdp_helper import eval_js
import json

js = """
(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase().includes('inscan at hub'));
    if (btn) {
        btn.click();
        return "Clicked Inscan At Hub";
    }
    return "Inscan button not found";
})()
"""

res = eval_js(js)
print(res)

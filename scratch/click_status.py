from cdp_helper import eval_js
import json

js = """
(() => {
    const statusBtn = Array.from(document.querySelectorAll('button, div')).find(el => el.textContent && el.textContent.includes('Status: Non Settled'));
    if (statusBtn) {
        statusBtn.click();
        return "Clicked status button";
    }
    return "Status button not found";
})()
"""

res = eval_js(js)
print(res)

from cdp_helper import eval_js
import json

js = """
(() => {
    const a = document.querySelector('a[href*="/ops/reconciliation/recon/"]');
    if (a) {
        a.click();
        return "Clicked recon link: " + a.href;
    }
    return "Not found";
})()
"""

res = eval_js(js)
print(res)

from cdp_helper import eval_js
import json
import time

js = """
(() => {
    const a = document.querySelector('a[href*="/ops/retail/trip/details/"]');
    if (a) {
        a.removeAttribute('target');
        a.click();
        return "Clicked a without target: " + a.href;
    }
    return "Link not found";
})()
"""

print(eval_js(js))

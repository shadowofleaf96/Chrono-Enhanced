from cdp_helper import eval_js
import json

js = """
(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent.trim(),
        className: b.className
    })).filter(b => b.text);
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

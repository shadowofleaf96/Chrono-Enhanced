from cdp_helper import eval_js
import json

js = """
(() => {
    const input = document.querySelector('.ant-modal input');
    if (!input) return "No input";
    input.style.setProperty('width', '100%', 'important');
    input.style.setProperty('flex', '1 1 auto', 'important');
    return {
        newWidth: window.getComputedStyle(input).width,
        rect: input.getBoundingClientRect()
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

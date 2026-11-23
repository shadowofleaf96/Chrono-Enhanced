from cdp_helper import eval_js
import json

js = """
(() => {
    const input = document.querySelector('.ant-modal input');
    if (!input) return "No input in modal";
    return {
        inputTag: input.tagName,
        inputClass: input.className,
        inputWidth: window.getComputedStyle(input).width,
        parentTag: input.parentElement.tagName,
        parentClass: input.parentElement.className,
        parentWidth: window.getComputedStyle(input.parentElement).width,
        grandParentTag: input.parentElement.parentElement?.tagName,
        grandParentClass: input.parentElement.parentElement?.className,
        grandParentWidth: input.parentElement.parentElement ? window.getComputedStyle(input.parentElement.parentElement).width : null
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

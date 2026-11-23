from cdp_helper import eval_js
import json

js = """
(() => {
    const filters = document.querySelector('[class*="containerDefaultFilter-"]');
    const parent = filters ? filters.parentElement : null;
    return {
        parentTag: parent ? parent.tagName : null,
        parentClass: parent ? parent.className : null,
        parentComputedStyle: parent ? {
            display: window.getComputedStyle(parent).display,
            flexDirection: window.getComputedStyle(parent).flexDirection,
            height: window.getComputedStyle(parent).height
        } : null,
        filtersComputedStyle: filters ? {
            height: window.getComputedStyle(filters).height,
            display: window.getComputedStyle(filters).display,
            position: window.getComputedStyle(filters).position
        } : null
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

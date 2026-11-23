from cdp_helper import eval_js
import json

js = """
(() => {
    const row = document.querySelector('[class*="Component-filterRow-"]');
    if (!row) return null;
    return Array.from(row.querySelectorAll('*')).map(el => {
        if (el.children.length === 0 && el.textContent.trim()) {
            return {
                text: el.textContent.trim(),
                tag: el.tagName,
                parentTag: el.parentElement.tagName,
                parentClass: el.parentElement.className
            };
        }
        return null;
    }).filter(Boolean);
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

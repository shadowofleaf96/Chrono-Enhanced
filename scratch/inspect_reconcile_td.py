from cdp_helper import eval_js
import json

js = """
(() => {
    const td = document.querySelector('td.ant-table-cell-fix-right');
    if (!td) return null;
    return {
        html: td.innerHTML,
        text: td.textContent.trim(),
        elements: Array.from(td.querySelectorAll('*')).map(el => ({
            tag: el.tagName,
            class: el.className,
            text: el.textContent.trim()
        }))
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

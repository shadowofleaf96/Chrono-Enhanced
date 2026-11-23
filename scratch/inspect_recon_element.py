import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js
import json

js = """
(() => {
    const el = Array.from(document.querySelectorAll('tbody tr *')).find(e => (e.innerText || '').trim() === 'Reconcile');
    if (!el) return "Reconcile element not found";
    return {
        tag: el.tagName,
        className: el.className,
        href: el.getAttribute('href'),
        rect: el.getBoundingClientRect()
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

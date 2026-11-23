import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js
import json

js = """
(() => {
    const panes = Array.from(document.querySelectorAll('.ant-tabs-tabpane')).map((p, idx) => {
        return {
            index: idx,
            id: p.id,
            className: p.className,
            ariaHidden: p.getAttribute('aria-hidden'),
            htmlSnippet: p.innerHTML.substring(0, 1000)
        };
    });
    return panes;
})()
"""

res = eval_js(js)
for p in res:
    print(f"--- PANE {p['index']} (hidden={p['ariaHidden']}) ---")
    print(p['htmlSnippet'][:300])
    print()

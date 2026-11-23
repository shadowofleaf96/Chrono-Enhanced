import sys
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    const iframe = document.querySelector('#chrono-inscan-iframe');
    const idoc = iframe ? iframe.contentDocument : null;
    if (!idoc) return 'no idoc';
    const root = idoc.querySelector('#root');
    return {
        rootFound: !!root,
        rootDisplay: root ? idoc.defaultView.getComputedStyle(root).display : null,
        rootChildren: root ? Array.from(root.children).map(c => ({
            tag: c.tagName,
            className: c.className,
            display: idoc.defaultView.getComputedStyle(c).display
        })) : [],
        styleEl: idoc.getElementById('chrono-iframe-style-enhanced')?.textContent
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

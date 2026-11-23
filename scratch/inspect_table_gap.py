import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js
import json

js = """
(() => {
    // Switch to tab 1
    document.querySelectorAll('.ant-tabs-tab')[1].click();

    const pane = document.querySelectorAll('.ant-tabs-tabpane')[1];
    if (!pane) return "no pane";

    const allDivs = Array.from(pane.querySelectorAll('*')).map(el => {
        const r = el.getBoundingClientRect();
        return {
            tag: el.tagName,
            cls: el.className,
            h: r.height,
            top: r.top,
            bottom: r.bottom,
            styleH: el.style.height,
            styleMinH: el.style.minHeight
        };
    }).filter(x => x.h > 150);

    return {
        paneRect: pane.getBoundingClientRect(),
        windowH: window.innerHeight,
        bodyScrollH: document.body.scrollHeight,
        tallElements: allDivs
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

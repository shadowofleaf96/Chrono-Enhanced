import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    // Switch to tab 1
    const tabs = document.querySelectorAll('.ant-tabs-tab');
    if (tabs[1]) tabs[1].click();

    const pane = document.querySelector('.ant-tabs-tabpane:not(.ant-tabs-tabpane-hidden)');
    if (!pane) return "no pane";

    return {
        paneHTML: pane.innerHTML.substring(0, 3000),
        tableContainers: Array.from(pane.querySelectorAll('div')).filter(d => {
            const h = window.getComputedStyle(d).minHeight;
            return h && (h.includes('420') || h.includes('280'));
        }).map(d => ({
            tag: d.tagName,
            className: d.className,
            style: d.getAttribute('style'),
            minHeight: window.getComputedStyle(d).minHeight,
            height: window.getComputedStyle(d).height
        }))
    };
})()
"""

import json
res = eval_js(js)
print("Pane classes/containers:")
print(json.dumps(res.get('tableContainers'), indent=2))
with open('scratch/pane_html.txt', 'w', encoding='utf-8') as f:
    f.write(res.get('paneHTML', ''))
print("HTML saved to scratch/pane_html.txt")

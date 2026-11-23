import sys
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    const iframe = document.querySelector('#chrono-inscan-iframe');
    const idoc = iframe ? iframe.contentDocument : null;
    
    // Check main doc
    const mainMatches = [];
    document.querySelectorAll('*').forEach(el => {
        if (el.children.length === 0 && (el.innerText || '').includes('Consignments Dashboard')) {
            const r = el.getBoundingClientRect();
            mainMatches.push({ inDoc: 'main', tag: el.tagName, rect: { top: r.top, left: r.left, width: r.width, height: r.height }, visible: r.width > 0 && r.height > 0 });
        }
    });

    // Check idoc
    const iframeMatches = [];
    if (idoc) {
        idoc.querySelectorAll('*').forEach(el => {
            if (el.children.length === 0 && (el.innerText || '').includes('Consignments Dashboard')) {
                const r = el.getBoundingClientRect();
                iframeMatches.push({ inDoc: 'iframe', tag: el.tagName, rect: { top: r.top, left: r.left, width: r.width, height: r.height }, visible: r.width > 0 && r.height > 0 });
            }
        });
    }

    return {
        mainMatches,
        iframeMatches
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

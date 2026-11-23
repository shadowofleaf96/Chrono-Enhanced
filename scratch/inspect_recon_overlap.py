import sys
from cdp_helper import eval_js

js = """
(() => {
    const filters = document.querySelector('[class*="containerDefaultFilter-"]');
    const viewBtn = Array.from(document.querySelectorAll('button, a, span, div')).find(el => (el.textContent || '').includes('View Rider Transactions'));
    const tableWrap = document.querySelector('.ant-table-wrapper') || document.querySelector('[class*="fixedHeaderTable"]') || document.querySelector('.ant-table');
    
    return {
        filters: filters ? {
            className: filters.className,
            rect: filters.getBoundingClientRect(),
            styleHeight: filters.style.height,
            computedHeight: window.getComputedStyle(filters).height
        } : null,
        viewBtn: viewBtn ? {
            text: viewBtn.textContent.trim(),
            rect: viewBtn.getBoundingClientRect(),
            parentClass: viewBtn.parentElement ? viewBtn.parentElement.className : null
        } : null,
        tableWrap: tableWrap ? {
            className: tableWrap.className,
            rect: tableWrap.getBoundingClientRect()
        } : null,
        childrenOfMain: Array.from(document.querySelector('[class*="mainDiv-"]')?.children || []).map(c => ({
            tag: c.tagName,
            className: c.className,
            rect: c.getBoundingClientRect()
        }))
    };
})()
"""

import json
res = eval_js(js)
print(json.dumps(res, indent=2))

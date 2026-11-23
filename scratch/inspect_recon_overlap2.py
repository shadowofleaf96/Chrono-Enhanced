from cdp_helper import eval_js
import json

js = """
(() => {
    function rectToObj(r) {
        if (!r) return null;
        return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, y: r.y };
    }
    const filters = document.querySelector('[class*="containerDefaultFilter-"]');
    const viewBtn = Array.from(document.querySelectorAll('a, button, span, div')).find(el => el.textContent && el.textContent.includes('View Rider Transactions'));
    const tableWrap = document.querySelector('.ant-table-wrapper') || document.querySelector('[class*="fixedHeaderTable"]') || document.querySelector('.ant-table');
    
    // Also let's check the rows inside filters
    const filterRows = filters ? Array.from(filters.children).map(c => ({
        className: c.className,
        rect: rectToObj(c.getBoundingClientRect())
    })) : [];

    return {
        filters: filters ? {
            className: filters.className,
            rect: rectToObj(filters.getBoundingClientRect()),
            computedHeight: window.getComputedStyle(filters).height,
            rows: filterRows
        } : null,
        viewBtn: viewBtn ? {
            text: viewBtn.textContent.trim(),
            rect: rectToObj(viewBtn.getBoundingClientRect()),
            parentClass: viewBtn.parentElement ? viewBtn.parentElement.className : null
        } : null,
        tableWrap: tableWrap ? {
            className: tableWrap.className,
            rect: rectToObj(tableWrap.getBoundingClientRect())
        } : null
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

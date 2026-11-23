from cdp_helper import eval_js
import json

js = """
(() => {
    function rectToObj(r) {
        if (!r) return null;
        return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, y: r.y };
    }
    const filters = document.querySelector('[class*="containerDefaultFilter-"]');
    if (filters) {
        filters.style.setProperty('height', 'auto', 'important');
        filters.style.setProperty('max-height', 'none', 'important');
        filters.style.setProperty('flex', '0 0 auto', 'important');
    }
    const tableWrap = document.querySelector('.ant-table-wrapper') || document.querySelector('[class*="fixedHeaderTable"]');
    
    return {
        filtersRect: rectToObj(filters?.getBoundingClientRect()),
        tableRect: rectToObj(tableWrap?.getBoundingClientRect())
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

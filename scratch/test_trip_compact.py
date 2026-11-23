from cdp_helper import eval_js
import json

js = """
(() => {
    // Compact form items
    document.querySelectorAll('.formContainer-0-3-166, [class*="formContainer-"]').forEach(f => {
        f.style.setProperty('padding', '2px 4px', 'important');
        f.style.setProperty('margin', '0', 'important');
    });
    document.querySelectorAll('[class*="nonSelectFilters-"], [class*="actionButtons-"]').forEach(el => {
        el.style.setProperty('margin', '2px 4px 2px 0', 'important');
        el.style.setProperty('padding', '0', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('min-height', '0', 'important');
    });
    document.querySelectorAll('[class*="rightItems-"], [class*="Oe-rightItems-"]').forEach(el => {
        el.style.setProperty('padding', '2px 4px', 'important');
        el.style.setProperty('margin', '2px 0', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('min-height', '36px', 'important');
    });
    document.querySelectorAll('[class*="containerDefaultFilter-"]').forEach(el => {
        el.style.setProperty('padding', '2px 4px', 'important');
        el.style.setProperty('margin', '0', 'important');
        el.style.setProperty('height', 'auto', 'important');
    });
    
    const table = document.querySelector('.ant-table-wrapper') || document.querySelector('.ant-table');
    return {
        tableTop: table ? Math.round(table.getBoundingClientRect().top) : null,
        tableHeight: table ? Math.round(table.getBoundingClientRect().height) : null
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

from cdp_helper import eval_js
import json

js = """
(() => {
    const modal = document.querySelector('.chrono-ext-month-modal');
    if (!modal) return "No modal";
    const dateInput = document.getElementById('chrono-settlement-date');
    const fetchBtn = document.getElementById('chrono-settlement-fetch-btn');
    const exportBtn = document.getElementById('chrono-settlement-export-btn');
    
    return {
        modalWidth: window.getComputedStyle(modal).width,
        modalHeight: window.getComputedStyle(modal).height,
        dateWidth: dateInput ? window.getComputedStyle(dateInput).width : null,
        fetchWidth: fetchBtn ? window.getComputedStyle(fetchBtn).width : null,
        exportWidth: exportBtn ? window.getComputedStyle(exportBtn).width : null
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

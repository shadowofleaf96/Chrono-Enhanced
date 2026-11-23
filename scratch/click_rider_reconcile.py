from cdp_helper import eval_js
import json

js = """
(() => {
    // 1. Close modal
    const closeBtn = document.querySelector('.chrono-ext-month-modal-close');
    if (closeBtn) closeBtn.click();
    
    // 2. Find Reconcile button in the table
    const recBtn = Array.from(document.querySelectorAll('tbody tr button, tbody tr a')).find(el => (el.textContent || '').trim().toLowerCase() === 'reconcile');
    if (recBtn) {
        recBtn.click();
        return "Clicked Reconcile on rider";
    }
    return "Reconcile button not found";
})()
"""

res = eval_js(js)
print(res)

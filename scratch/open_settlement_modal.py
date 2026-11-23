from cdp_helper import eval_js
import json

js = """
(() => {
    // Call showRiderSettlementModal directly or click its trigger
    if (typeof showRiderSettlementModal === 'function') {
        showRiderSettlementModal();
        return "Called showRiderSettlementModal";
    }
    const item = document.querySelector('.chrono-ext-settlement-menu-item') || Array.from(document.querySelectorAll('*')).find(e => e.textContent.includes('Rider Settlement Amounts'));
    if (item) {
        item.click();
        return "Clicked settlement item";
    }
    return "Not found";
})()
"""

res = eval_js(js)
print(res)

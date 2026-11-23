from cdp_helper import eval_js
import json

js = """
(() => {
    // Check if ensureCashBalanceSettleHelper can be run
    if (typeof ensureCashBalanceSettleHelper === 'function') {
        ensureCashBalanceSettleHelper();
    }
    const btn = document.getElementById('chrono-check-all-delivered-btn');
    return {
        btnFound: !!btn,
        btnText: btn ? btn.textContent.trim() : null
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

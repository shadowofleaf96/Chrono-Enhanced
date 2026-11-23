from cdp_helper import eval_js
import json

js = """
(() => {
    // Navigate back to rider-list
    window.location.href = 'https://cross.chronodiali.ma/ops/reconciliation/rider-list';
})()
"""

eval_js(js)
print("Navigating to rider list...")

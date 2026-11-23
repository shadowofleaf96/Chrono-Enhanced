from cdp_helper import eval_js
import json

js = """
(() => {
    // Navigate to recon page if not there
    if (!location.pathname.includes('/ops/reconciliation/recon/')) {
        location.href = 'https://cross.chronodiali.ma/ops/reconciliation/recon/AHA01';
    }
})()
"""
eval_js(js)
print("Navigating...")

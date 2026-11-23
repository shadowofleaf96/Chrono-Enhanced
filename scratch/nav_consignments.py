from cdp_helper import eval_js
import json

js = """
(() => {
    window.location.href = 'https://cross.chronodiali.ma/ops/consignments';
})()
"""

eval_js(js)
print("Navigating to consignments...")

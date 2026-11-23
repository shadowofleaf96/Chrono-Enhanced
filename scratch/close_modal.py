from cdp_helper import eval_js
import json

js = """
(() => {
    // Click Cancel on current modal
    const cancelBtn = Array.from(document.querySelectorAll('.ant-modal-footer button')).find(b => b.textContent.trim() === 'Cancel');
    if (cancelBtn) cancelBtn.click();
    return "Closed modal";
})()
"""

res = eval_js(js)
print(res)

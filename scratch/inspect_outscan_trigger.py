from cdp_helper import eval_js
import json

js = """
(() => {
    // 1. Close open modal if any
    const cancelBtn = Array.from(document.querySelectorAll('.ant-modal-footer button')).find(b => b.textContent.trim() === 'Cancel');
    if (cancelBtn) cancelBtn.click();
    
    // 2. Find Outscan at hub button
    const outscanBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase().includes('outscan'));
    return {
        foundOutscan: !!outscanBtn,
        outscanText: outscanBtn?.textContent.trim(),
        outscanClasses: outscanBtn?.className
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

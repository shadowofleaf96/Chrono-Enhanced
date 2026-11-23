from cdp_helper import eval_js
import json

js = """
(() => {
    // Close modal if open
    const cancelBtn = Array.from(document.querySelectorAll('.ant-modal-footer button')).find(b => b.textContent.trim() === 'Cancel');
    if (cancelBtn) cancelBtn.click();
    
    // Find outscan button
    const outscanBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase().includes('outscan'));
    if (outscanBtn) {
        outscanBtn.click();
        return "Clicked Outscan button";
    }
    return "Outscan not found";
})()
"""

res = eval_js(js)
print(res)

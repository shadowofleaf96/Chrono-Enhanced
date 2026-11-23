from cdp_helper import eval_js
import json

js = """
(() => {
    const modal = document.querySelector('.ant-modal-content');
    const input = modal?.querySelector('input[placeholder*="Add consignments"], input[placeholder*="CN"]');
    const btn = modal?.querySelector('.chrono-ext-import-btn');
    const groupWrapper = input?.closest('.ant-input-group-wrapper') || input?.closest('.ant-input-wrapper');
    
    if (groupWrapper && btn) {
        groupWrapper.parentNode.insertBefore(btn, groupWrapper.nextSibling);
    }
    
    if (groupWrapper) {
        groupWrapper.style.setProperty('width', '100%', 'important');
        groupWrapper.style.setProperty('display', 'block', 'important');
    }
    
    const inputGroup = input?.closest('.ant-input-group');
    if (inputGroup) {
        inputGroup.style.setProperty('width', '100%', 'important');
        inputGroup.style.setProperty('display', 'flex', 'important');
    }
    
    if (input) {
        input.style.setProperty('width', '100%', 'important');
        input.style.setProperty('flex', '1 1 auto', 'important');
        input.style.setProperty('min-height', '44px', 'important');
        input.style.setProperty('font-size', '15px', 'important');
    }
    
    if (btn) {
        btn.style.setProperty('width', '100%', 'important');
        btn.style.setProperty('min-height', '42px', 'important');
        btn.style.setProperty('margin-top', '8px', 'important');
        btn.style.setProperty('margin-bottom', '8px', 'important');
        btn.style.setProperty('border-radius', '8px', 'important');
    }
    
    return {
        inputWidth: input ? window.getComputedStyle(input).width : null,
        btnWidth: btn ? window.getComputedStyle(btn).width : null
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

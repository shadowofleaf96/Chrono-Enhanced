from cdp_helper import eval_js
import json

js = """
(() => {
    const modal = document.querySelector('.ant-modal-content');
    if (!modal) return "No modal";
    return {
        title: modal.querySelector('.ant-modal-title')?.textContent?.trim(),
        text: modal.textContent.slice(0, 150),
        inputs: Array.from(modal.querySelectorAll('input, select, button')).map(el => ({
            tag: el.tagName,
            type: el.type,
            placeholder: el.placeholder,
            text: el.textContent.trim()
        }))
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

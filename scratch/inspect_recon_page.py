from cdp_helper import eval_js
import json

js = """
(() => {
    return {
        tabs: Array.from(document.querySelectorAll('.ant-tabs-tab')).map(t => t.textContent.trim()),
        activeTab: document.querySelector('.ant-tabs-tab-active')?.textContent?.trim(),
        buttons: Array.from(document.querySelectorAll('button')).map(b => ({
            text: b.textContent.trim(),
            id: b.id,
            className: b.className.slice(0, 40)
        })).filter(b => b.text),
        inputs: Array.from(document.querySelectorAll('input')).map(inp => ({
            placeholder: inp.placeholder,
            type: inp.type,
            value: inp.value,
            className: inp.className.slice(0, 40)
        })),
        cards: Array.from(document.querySelectorAll('[class*="Card"], [class*="card"], [class*="balance"], [class*="detail"]')).map(c => ({
            className: c.className.slice(0, 40),
            text: c.textContent.trim().slice(0, 50)
        })).filter(c => c.text).slice(0, 10)
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

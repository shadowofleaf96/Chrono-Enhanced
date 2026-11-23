from cdp_helper import eval_js
import json

js = """
(() => {
    function rectToObj(r) {
        if (!r) return null;
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) };
    }
    const filterContainer = document.querySelector('[class*="containerDefaultFilter-"]');
    if (!filterContainer) return null;
    
    return Array.from(filterContainer.children).map(c => ({
        tag: c.tagName,
        class: c.className,
        rect: rectToObj(c.getBoundingClientRect()),
        children: Array.from(c.children).map(cc => ({
            tag: cc.tagName,
            class: cc.className,
            text: cc.textContent.trim().slice(0, 30),
            rect: rectToObj(cc.getBoundingClientRect())
        }))
    }));
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

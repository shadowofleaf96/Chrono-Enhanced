from cdp_helper import eval_js
import json

js = """
(() => {
    function rectToObj(r) {
        if (!r) return null;
        return {
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            height: Math.round(r.height),
            width: Math.round(r.width),
            left: Math.round(r.left)
        };
    }
    
    // Check all direct children of the page container above tabs
    const mainDiv = document.querySelector('[class*="mainDiv-"]');
    const elements = [];
    if (mainDiv) {
        Array.from(mainDiv.children).forEach(c => {
            elements.push({
                tag: c.tagName,
                class: c.className.slice(0, 40),
                rect: rectToObj(c.getBoundingClientRect()),
                text: c.textContent.trim().slice(0, 50)
            });
        });
    }
    
    // Check elements with top < 454
    const topElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 44 && r.bottom <= 460 && r.height > 20 && el.children.length <= 3 && el.textContent.trim();
    }).map(el => ({
        tag: el.tagName,
        class: el.className.slice(0, 40),
        rect: rectToObj(el.getBoundingClientRect()),
        text: el.textContent.trim().slice(0, 40)
    }));

    return {
        mainChildren: elements,
        topElements: topElements.slice(0, 15)
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

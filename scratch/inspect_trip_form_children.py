from cdp_helper import eval_js
import json

js = """
(() => {
    function rectToObj(r) {
        if (!r) return null;
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) };
    }
    const form = document.querySelector('form.formContainer-0-3-166') || document.querySelector('form');
    if (!form) return null;
    return Array.from(form.children).map(c => ({
        tag: c.tagName,
        class: c.className,
        style: c.getAttribute('style'),
        computed: {
            margin: window.getComputedStyle(c).margin,
            padding: window.getComputedStyle(c).padding,
            height: window.getComputedStyle(c).height,
            width: window.getComputedStyle(c).width
        },
        rect: rectToObj(c.getBoundingClientRect()),
        text: c.textContent.trim().slice(0, 30)
    }));
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

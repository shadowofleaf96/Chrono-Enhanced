from cdp_helper import eval_js
import json

js = """
(() => {
    const recBtn = Array.from(document.querySelectorAll('tbody tr button, tbody tr a, tbody tr span, tbody tr div')).find(el => (el.textContent || '').trim().toLowerCase() === 'reconcile');
    if (!recBtn) return "Reconcile element not found";
    return {
        tag: recBtn.tagName,
        class: recBtn.className,
        href: recBtn.href || recBtn.getAttribute('href'),
        onclick: recBtn.getAttribute('onclick'),
        parentTag: recBtn.parentElement.tagName,
        parentClass: recBtn.parentElement.className
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

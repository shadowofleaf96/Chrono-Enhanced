from cdp_helper import eval_js
import json

js = """
(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/ops/reconciliation/recon/"]')).map(a => a.href);
    const actionBtns = Array.from(document.querySelectorAll('button, a')).filter(el => {
        const t = (el.textContent || '').toLowerCase();
        return t.includes('reconcile') || t.includes('settle');
    }).map(el => ({
        tag: el.tagName,
        text: el.textContent.trim(),
        href: el.href || el.getAttribute('href')
    }));
    return {
        reconLinks: links,
        actionBtns: actionBtns,
        rowCount: document.querySelectorAll('tbody tr').length,
        tbodyText: document.querySelector('tbody')?.textContent?.trim()?.slice(0, 100)
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

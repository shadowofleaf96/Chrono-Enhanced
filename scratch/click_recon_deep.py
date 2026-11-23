import sys
import time
import subprocess
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    const list = Array.from(document.querySelectorAll('tbody tr *')).filter(el => (el.innerText || '').trim() === 'Reconcile');
    const items = list.map(el => ({
        tag: el.tagName,
        className: el.className,
        parentTag: el.parentElement?.tagName,
        href: el.getAttribute('href') || el.closest('a')?.getAttribute('href')
    }));

    // Find the clickable link
    const target = list.find(el => el.tagName === 'A' || el.closest('a')) || list[0];
    if (target) {
        const link = target.closest('a') || target;
        ['mouseenter', 'mousedown', 'mouseup', 'click'].forEach(type => {
            link.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
        link.click();
        return { items, clicked: true, href: link.getAttribute('href') };
    }
    return { items, clicked: false };
})()
"""

res = eval_js(js)
print(res)
time.sleep(3)
print("URL after click:", eval_js("location.href"))

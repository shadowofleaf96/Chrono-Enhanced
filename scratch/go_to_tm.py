from cdp_helper import eval_js
import json
import time

js_open_menu = """
(() => {
    const hamburger = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
    if (hamburger) {
        hamburger.click();
        return "Clicked hamburger";
    }
    const nav = document.querySelector('header') || document.querySelector('[class*="navbar-"]');
    for (const elem of [hamburger, nav]) {
        if (!elem) continue;
        const k = Object.keys(elem).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        let cur = elem[k];
        while (cur) {
            if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
                cur.memoizedProps.toggleSideMenu();
                return "Called toggleSideMenu";
            }
            cur = cur.return;
        }
    }
    return "Hamburger not found";
})()
"""

print(eval_js(js_open_menu))
time.sleep(1)

js_click_tm = """
(() => {
    const links = Array.from(document.querySelectorAll('a, li, span, div')).filter(el => {
        const text = (el.innerText || '').toLowerCase().trim();
        return text === 'trip manager' || text === 'trips' || text.includes('trip manager');
    });
    if (links.length > 0) {
        // pick deepest or clickable
        const target = links[links.length - 1];
        target.click();
        return "Clicked: " + target.innerText;
    }
    return "Trip manager link not found";
})()
"""

print(eval_js(js_click_tm))

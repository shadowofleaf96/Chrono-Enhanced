from cdp_helper import eval_js
import json

js = """
(() => {
    const tabs = Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]')).map(t => t.innerText);
    const tables = Array.from(document.querySelectorAll('.ant-table-wrapper, .ant-table')).map(t => ({
        className: t.className,
        width: t.clientWidth,
        scrollWidth: t.scrollWidth
    }));
    const cards = Array.from(document.querySelectorAll('.ant-card, [class*="card" i], [class*="trip" i]')).slice(0, 15).map(c => ({
        tag: c.tagName,
        className: c.className,
        style: c.getAttribute('style')
    }));

    return {
        url: location.href,
        tabs: tabs,
        tables: tables,
        cards: cards
    };
})()
"""

print(json.dumps(eval_js(js), indent=2))

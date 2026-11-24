import json
from cdp_helper import eval_js

js = """
(() => {
    const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
        return (el.scrollHeight > el.clientHeight && el.clientHeight > 200) || (el.scrollWidth > el.clientWidth && el.clientWidth > 100);
    }).map(el => ({
        tag: el.tagName,
        className: el.className,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
    }));

    const cards = Array.from(document.querySelectorAll('.ant-card, [class*="card" i], [class*="detail" i], .ant-row, [class*="section" i]')).slice(0, 30).map(el => ({
        tag: el.tagName,
        className: el.className,
        text: el.innerText ? el.innerText.substring(0, 50).replace(/\\n/g, ' ') : ''
    }));

    return {
        url: location.href,
        scrollables: scrollables,
        cards: cards
    };
})()
"""

print(json.dumps(eval_js(js), indent=2))

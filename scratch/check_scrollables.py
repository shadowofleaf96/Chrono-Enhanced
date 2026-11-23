import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js
import json

js = """
(() => {
    const scrollables = Array.from(document.querySelectorAll('*')).map(el => {
        return {
            tag: el.tagName,
            cls: el.className,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            scrollTop: el.scrollTop,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth
        };
    }).filter(x => (x.scrollHeight - x.clientHeight > 10) || (x.scrollWidth - x.clientWidth > 10));

    return scrollables;
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

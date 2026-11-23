import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js
import json

js = """
(() => {
    const iframe = document.querySelector('#chrono-inscan-iframe');
    if (!iframe) return "no iframe";

    const idoc = iframe.contentDocument;
    if (!idoc) return "no idoc";

    const buttons = Array.from(idoc.querySelectorAll('button, .ant-btn, a, [role="button"]')).map(b => ({
        tag: b.tagName,
        text: b.innerText.trim(),
        className: b.className,
        visible: b.offsetParent !== null
    }));

    const modals = Array.from(idoc.querySelectorAll('.ant-modal, .ant-modal-content, [role="dialog"]')).map(m => ({
        className: m.className,
        visible: m.offsetParent !== null,
        text: m.innerText.substring(0, 100)
    }));

    const menus = Array.from(idoc.querySelectorAll('.ant-dropdown, .ant-dropdown-menu, li')).map(l => ({
        className: l.className,
        text: l.innerText.trim(),
        visible: l.offsetParent !== null
    })).filter(x => x.text);

    return {
        url: idoc.location.href,
        title: idoc.title,
        buttons,
        modals,
        menus
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

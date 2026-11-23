import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    const tabs = Array.from(document.querySelectorAll('.ant-tabs-tab')).map(t => ({
        text: t.innerText.trim(),
        active: t.classList.contains('ant-tabs-tab-active')
    }));

    const scrollWidth = document.body.scrollWidth;
    const innerWidth = window.innerWidth;
    const bodyHeight = document.body.scrollHeight;
    const innerHeight = window.innerHeight;

    const table = document.querySelector('.ant-table');
    const tableRect = table ? table.getBoundingClientRect() : null;

    const tableContainer = document.querySelector('[class*="tableContainer-"]');
    const tableContainerStyle = tableContainer ? {
        minHeight: tableContainer.style.minHeight,
        computedMinHeight: window.getComputedStyle(tableContainer).minHeight,
        computedHeight: window.getComputedStyle(tableContainer).height
    } : null;

    const minHeight420El = document.querySelector('div[style*="420px"]');
    const minHeight420 = minHeight420El ? {
        style: minHeight420El.getAttribute('style'),
        rect: minHeight420El.getBoundingClientRect()
    } : null;

    const toast = document.querySelector('.chrono-ext-toast');

    return {
        tabs,
        viewport: { innerWidth, scrollWidth, innerHeight, bodyHeight },
        tableRect,
        tableContainerStyle,
        minHeight420,
        toastVisible: !!toast
    };
})()
"""

import json
res = eval_js(js)
print(json.dumps(res, indent=2))

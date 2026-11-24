from cdp_helper import eval_js
import json

js = """
(() => {
    const cells = Array.from(document.querySelectorAll('td, .ant-table-cell'));
    const mohCell = cells.find(c => c.innerText.includes('MOH01001119'));
    if (!mohCell) return "mohCell not found";

    return {
        cellTag: mohCell.tagName,
        cellClass: mohCell.className,
        html: mohCell.innerHTML,
        clickableChildren: Array.from(mohCell.querySelectorAll('*')).map(el => ({
            tag: el.tagName,
            className: el.className,
            text: el.innerText
        }))
    };
})()
"""

print(json.dumps(eval_js(js), indent=2))

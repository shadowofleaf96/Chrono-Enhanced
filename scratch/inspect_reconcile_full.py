from cdp_helper import eval_js
import json

js = """
(() => {
    function rectToObj(r) {
        if (!r) return null;
        return {
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            height: Math.round(r.height),
            width: Math.round(r.width),
            left: Math.round(r.left),
            right: Math.round(r.right)
        };
    }

    const mainDiv = document.querySelector('[class*="mainDiv-"]') || document.querySelector('.lr-contentDiv-0-3-14') || document.body;

    // Check all direct or high-level containers inside content
    const sections = Array.from(document.querySelectorAll('.ant-tabs-content-holder, .ant-tabs-tabpane, [role="tabpanel"], [class*="tabsCardsContainer-"], [class*="balanceHeader"], [class*="fixedHeaderTable"], .ant-table-wrapper, [class*="settlement"]')).map(el => ({
        tag: el.tagName,
        class: el.className,
        rect: rectToObj(el.getBoundingClientRect()),
        computed: {
            display: window.getComputedStyle(el).display,
            width: window.getComputedStyle(el).width,
            height: window.getComputedStyle(el).height,
            flexDirection: window.getComputedStyle(el).flexDirection,
            overflow: window.getComputedStyle(el).overflow
        },
        textPreview: el.textContent.trim().slice(0, 60)
    }));

    // Find the settle input and buttons
    const settleInput = document.querySelector('input[placeholder*="Settle" i], input.ant-input-number-input');
    const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase() === 'settle');
    const checkAllBtn = document.getElementById('chrono-check-all-delivered-btn');
    const table = document.querySelector('.ant-table');

    return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        sections: sections,
        settleInput: settleInput ? {
            rect: rectToObj(settleInput.getBoundingClientRect()),
            parentClass: settleInput.parentElement?.className,
            parentRect: rectToObj(settleInput.parentElement?.getBoundingClientRect()),
            grandParentRect: rectToObj(settleInput.parentElement?.parentElement?.getBoundingClientRect())
        } : null,
        settleBtn: settleBtn ? {
            rect: rectToObj(settleBtn.getBoundingClientRect()),
            parentClass: settleBtn.parentElement?.className,
            parentRect: rectToObj(settleBtn.parentElement?.getBoundingClientRect())
        } : null,
        checkAllBtn: checkAllBtn ? {
            rect: rectToObj(checkAllBtn.getBoundingClientRect()),
            parentClass: checkAllBtn.parentElement?.className
        } : null,
        table: table ? {
            rect: rectToObj(table.getBoundingClientRect()),
            rows: table.querySelectorAll('tbody tr').length,
            columns: Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim())
        } : null
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

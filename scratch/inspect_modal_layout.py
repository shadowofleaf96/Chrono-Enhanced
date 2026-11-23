from cdp_helper import eval_js
import json

js = """
(() => {
    function rectToObj(r) {
        if (!r) return null;
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) };
    }
    const modal = document.querySelector('.ant-modal-content');
    const wrap = modal?.closest('.ant-modal');
    const body = modal?.querySelector('.ant-modal-body');
    const table = modal?.querySelector('.ant-table');
    const input = modal?.querySelector('input[placeholder*="Add consignments"], input[placeholder*="CN"]');
    const footer = modal?.querySelector('.ant-modal-footer');
    
    return {
        wrap: {
            rect: rectToObj(wrap?.getBoundingClientRect()),
            styleWidth: wrap?.style?.width,
            computedWidth: wrap ? window.getComputedStyle(wrap).width : null
        },
        modal: {
            rect: rectToObj(modal?.getBoundingClientRect()),
            computedHeight: modal ? window.getComputedStyle(modal).height : null
        },
        body: {
            rect: rectToObj(body?.getBoundingClientRect()),
            overflowY: body ? window.getComputedStyle(body).overflowY : null,
            overflowX: body ? window.getComputedStyle(body).overflowX : null
        },
        table: {
            rect: rectToObj(table?.getBoundingClientRect()),
            computedWidth: table ? window.getComputedStyle(table).width : null
        },
        input: {
            rect: rectToObj(input?.getBoundingClientRect()),
            computedWidth: input ? window.getComputedStyle(input).width : null,
            parentClass: input?.parentElement?.className
        },
        footer: {
            rect: rectToObj(footer?.getBoundingClientRect()),
            buttons: Array.from(footer?.querySelectorAll('button') || []).map(b => ({
                text: b.textContent.trim(),
                rect: rectToObj(b.getBoundingClientRect())
            }))
        }
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

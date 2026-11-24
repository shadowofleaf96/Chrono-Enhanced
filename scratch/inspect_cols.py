from cdp_helper import eval_js
import json

js = """
(() => {
    const rowContainer = document.querySelector('[class*="rowContainer-"]');
    if (!rowContainer) return "No rowContainer";
    
    const rows = Array.from(document.querySelectorAll('[class*="rowContainer-"]')).slice(0, 3).map(rc => {
        return {
            containerClass: rc.className,
            children: Array.from(rc.children).map(c => ({
                tag: c.tagName,
                className: c.className,
                style: c.getAttribute('style'),
                cols: Array.from(c.querySelectorAll('.ant-col, [class*="col-"]')).map(col => ({
                    className: col.className,
                    style: col.getAttribute('style'),
                    text: col.innerText.replace(/\\n/g, ': ')
                }))
            }))
        };
    });

    // Check status widget
    const widget = document.querySelector('.chrono-status-widget, [class*="chrono-status"]');

    return {
        rows: rows,
        widget: widget ? { className: widget.className, style: widget.getAttribute('style') } : null
    };
})()
"""

print(json.dumps(eval_js(js), indent=2))

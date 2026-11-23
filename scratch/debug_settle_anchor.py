from cdp_helper import eval_js
import json

js = """
(() => {
    function getActiveTab() {
        const tabElements = Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]'));
        for (const tab of tabElements) {
            const isActive = tab.classList.contains('ant-tabs-tab-active') ||
                            tab.getAttribute('aria-selected') === 'true';
            if (isActive) {
                const text = tab.textContent.toLowerCase();
                if (text.includes('consignment')) return 'consignment';
                if (text.includes('cash') && !text.includes('non-cash') && !text.includes('consignment')) return 'cash';
                if (text.includes('non-cash')) return 'non-cash';
            }
        }
        return 'unknown';
    }

    const settleBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase() === 'settle');
    
    return {
        url: location.href,
        pathname: location.pathname,
        activeTab: getActiveTab(),
        settleBtn: settleBtn ? {
            text: settleBtn.textContent.trim(),
            parentClass: settleBtn.parentElement.className,
            offsetParent: !!settleBtn.offsetParent
        } : null
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

from cdp_helper import eval_js
import json
import time

js = """
(() => {
    const tabs = Array.from(document.querySelectorAll('.ant-tabs-tab, [role="tab"]'));
    const tripDetailsTab = tabs.find(t => t.innerText.trim().toLowerCase() === 'trip details');
    if (tripDetailsTab) {
        tripDetailsTab.click();
        return "Clicked Trip Details tab";
    }
    return "Tab not found";
})()
"""

print(eval_js(js))

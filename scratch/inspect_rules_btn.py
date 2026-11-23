import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js
import json

js = """
(() => {
    const btn = document.querySelector('.chrono-inscan-ext-btn');
    if (!btn) return "no btn";

    const matched = [];
    for (const sheet of Array.from(document.styleSheets)) {
        try {
            for (const rule of Array.from(sheet.cssRules || [])) {
                if (rule.selectorText && btn.matches(rule.selectorText)) {
                    if (rule.style.flex || rule.style.width) {
                        matched.push({
                            sheetId: sheet.ownerNode?.id || 'sheet',
                            selector: rule.selectorText,
                            flex: rule.style.flex,
                            width: rule.style.width
                        });
                    }
                }
            }
        } catch (e) {}
    }
    return matched;
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

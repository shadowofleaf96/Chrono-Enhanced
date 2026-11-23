from cdp_helper import eval_js

js = """
(() => {
  const el = document.querySelector('[class*="mainDiv-0-3-226"]');
  if (!el) return 'no el';
  const matched = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText && el.matches(rule.selectorText)) {
          matched.push({
            selector: rule.selectorText,
            cssText: rule.cssText.slice(0, 150)
          });
        }
      }
    } catch (e) {}
  }
  return JSON.stringify(matched);
})()
"""
print(eval_js(js))

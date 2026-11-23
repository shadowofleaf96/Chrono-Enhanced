from cdp_helper import eval_js

js = """
(() => {
  const nav = document.querySelector('.ant-tabs-nav');
  // Check which stylesheet has a rule setting flex-direction on nav
  const rules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const r of sheet.cssRules) {
        if (r.selectorText && r.selectorText.includes('ant-tabs-nav') && r.style.flexDirection) {
          rules.push({ sel: r.selectorText, dir: r.style.flexDirection, priority: r.style.getPropertyPriority('flex-direction') });
        }
      }
    } catch(e) {}
  }
  return rules;
})()
"""

print(eval_js(js))

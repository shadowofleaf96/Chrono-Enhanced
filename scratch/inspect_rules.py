from cdp_helper import eval_js

js = """
(() => {
  const ql = document.querySelector('[class*="Ql-mainDiv-"]');
  const tc = document.querySelector('[class*="Ql-tableContainer-"]');
  
  function getRules(el) {
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
    return matched;
  }
  
  return JSON.stringify({
    qlRules: getRules(ql),
    tcRules: getRules(tc)
  });
})()
"""
print(eval_js(js))

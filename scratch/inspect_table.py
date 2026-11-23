from cdp_helper import eval_js
import json

js = """
(() => {
  const ql = document.querySelector('[class*="Ql-mainDiv-"]');
  if (!ql) return 'No ql found';
  const qlStyle = window.getComputedStyle(ql);
  const tc = document.querySelector('[class*="Ql-tableContainer-"]');
  const tcStyle = tc ? window.getComputedStyle(tc) : null;
  return JSON.stringify({
    ql: {
      height: qlStyle.height,
      flex: qlStyle.flex,
      display: qlStyle.display,
      flexDirection: qlStyle.flexDirection,
      rect: { top: ql.getBoundingClientRect().top, height: ql.getBoundingClientRect().height, bottom: ql.getBoundingClientRect().bottom }
    },
    tc: tcStyle ? {
      height: tcStyle.height,
      flex: tcStyle.flex,
      display: tcStyle.display,
      flexDirection: tcStyle.flexDirection,
      rect: { top: tc.getBoundingClientRect().top, height: tc.getBoundingClientRect().height, bottom: tc.getBoundingClientRect().bottom }
    } : null,
    tcChildren: tc ? Array.from(tc.children).map(c => ({
      tag: c.tagName,
      className: (c.className||'').slice(0, 30),
      height: window.getComputedStyle(c).height,
      rect: { top: c.getBoundingClientRect().top, height: c.getBoundingClientRect().height, bottom: c.getBoundingClientRect().bottom }
    })) : []
  });
})()
"""
res = eval_js(js)
print(res)

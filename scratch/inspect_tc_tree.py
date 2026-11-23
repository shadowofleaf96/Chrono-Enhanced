from cdp_helper import eval_js

js = """
(() => {
  const tc = document.querySelector('[class*="Ql-tableContainer-"]');
  if (!tc) return 'no tc';
  function dump(node, depth = 0) {
    if (depth > 5) return [];
    return Array.from(node.children).map(c => ({
      tag: c.tagName,
      className: (c.className || '').slice(0, 40),
      height: Math.round(c.getBoundingClientRect().height),
      computedHeight: window.getComputedStyle(c).height,
      style: c.getAttribute('style'),
      children: dump(c, depth + 1)
    }));
  }
  return JSON.stringify(dump(tc));
})()
"""
print(eval_js(js))

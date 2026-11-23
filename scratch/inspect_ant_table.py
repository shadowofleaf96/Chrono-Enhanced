from cdp_helper import eval_js

js = """
(() => {
  const table = document.querySelector('.ant-table');
  if (!table) return 'no ant-table';
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
  return JSON.stringify(dump(table));
})()
"""
print(eval_js(js))

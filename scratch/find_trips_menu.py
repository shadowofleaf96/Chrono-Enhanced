from cdp_helper import eval_js

js = """
(() => {
  const items = Array.from(document.querySelectorAll('*')).filter(e => e.children.length === 0 && e.textContent && e.textContent.includes('FM and LM Trips'));
  return items.map(i => {
    const r = i.getBoundingClientRect();
    return { text: i.textContent, tag: i.tagName, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });
})()
"""

print(eval_js(js))

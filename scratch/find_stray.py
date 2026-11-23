from cdp_helper import eval_js

js = """
(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Map Edit'));
  if (!btn) return 'no btn';
  const r = btn.getBoundingClientRect();
  const els = document.elementsFromPoint(r.left + 5, r.bottom + 8);
  return els.map(e => ({
    tag: e.tagName,
    cls: e.className,
    text: e.textContent,
    html: e.outerHTML.substring(0, 200),
    rect: { x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }
  }));
})()
"""

print(eval_js(js))

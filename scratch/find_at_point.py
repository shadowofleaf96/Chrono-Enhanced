from cdp_helper import eval_js

js = """
(() => {
  const els = document.elementsFromPoint(240, 445);
  return els.map(e => ({
    tag: e.tagName,
    cls: e.className,
    id: e.id,
    border: window.getComputedStyle(e).border,
    bg: window.getComputedStyle(e).backgroundColor,
    rect: { x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }
  }));
})()
"""

print(eval_js(js))

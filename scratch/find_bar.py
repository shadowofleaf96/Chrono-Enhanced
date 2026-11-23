from cdp_helper import eval_js

js = """
(() => {
  const all = Array.from(document.querySelectorAll('*'));
  const found = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.x > 200 && r.x < 300 && r.y > 200 && r.y < 350) {
      const cs = window.getComputedStyle(el);
      found.push({
        tag: el.tagName,
        cls: el.className,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        bg: cs.backgroundColor,
        borderRight: cs.borderRight,
        borderLeft: cs.borderLeft
      });
    }
  }
  return found;
})()
"""

print(eval_js(js))

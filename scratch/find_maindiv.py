from cdp_helper import eval_js

js = """
(() => {
  const m = document.querySelector('[class*="mainDiv-0-3-226"]');
  if (!m) return 'none';
  const p = m.parentElement;
  return {
    m: {
      tag: m.tagName,
      cls: m.className,
      style: m.getAttribute('style'),
      border: window.getComputedStyle(m).border,
      boxShadow: window.getComputedStyle(m).boxShadow,
      width: window.getComputedStyle(m).width
    },
    p: {
      tag: p.tagName,
      cls: p.className,
      html: p.outerHTML.substring(0, 500)
    },
    siblings: Array.from(p.children).map(c => ({
      tag: c.tagName,
      cls: c.className,
      rect: { x: c.getBoundingClientRect().x, y: c.getBoundingClientRect().y, w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height }
    }))
  };
})()
"""

print(eval_js(js))

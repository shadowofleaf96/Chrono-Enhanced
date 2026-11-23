from cdp_helper import eval_js

js = """
(() => {
  const h = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
  if (!h) return 'no hamburger';
  const r = h.getBoundingClientRect();
  return {
    id: h.id,
    tag: h.tagName,
    rect: { x: r.x, y: r.y, w: r.width, h: r.height }
  };
})()
"""

print(eval_js(js))

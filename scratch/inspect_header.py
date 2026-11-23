from cdp_helper import eval_js

js = """
(() => {
  const header = document.querySelector('header') || document.querySelector('[class*="navbar-"]');
  if (!header) return 'no header';
  return JSON.stringify(Array.from(header.children).map(c => ({
    tag: c.tagName,
    className: (c.className || '').slice(0, 40),
    rect: { left: Math.round(c.getBoundingClientRect().left), width: Math.round(c.getBoundingClientRect().width) },
    display: window.getComputedStyle(c).display,
    style: c.getAttribute('style'),
    children: Array.from(c.children).map(cc => ({
      tag: cc.tagName,
      className: (cc.className || '').slice(0, 40),
      id: cc.id,
      rect: { left: Math.round(cc.getBoundingClientRect().left), width: Math.round(cc.getBoundingClientRect().width) },
      display: window.getComputedStyle(cc).display
    }))
  })));
})()
"""
print(eval_js(js))

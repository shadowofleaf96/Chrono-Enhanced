from cdp_helper import eval_js

js = """
(() => {
  const container = document.querySelector('[class*="Oe-containerDefaultFilter-"]');
  if (!container) return 'no container';
  const parent = container.parentElement;
  return JSON.stringify({
    containerStyle: container.getAttribute('style'),
    containerDisplay: window.getComputedStyle(container).display,
    containerFlex: window.getComputedStyle(container).flexDirection,
    containerRect: container.getBoundingClientRect(),
    children: Array.from(container.children).map(c => ({
      tag: c.tagName,
      className: (c.className || '').slice(0, 40),
      style: c.getAttribute('style'),
      display: window.getComputedStyle(c).display,
      position: window.getComputedStyle(c).position,
      rect: c.getBoundingClientRect()
    }))
  });
})()
"""
print(eval_js(js))

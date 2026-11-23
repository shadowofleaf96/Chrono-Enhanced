from cdp_helper import eval_js

js = """
(() => {
  const fw = document.querySelector('[class*="filterBarWrapper-"]');
  const sib = fw ? fw.nextElementSibling : null;
  return sib ? {
    tag: sib.tagName,
    cls: sib.className,
    html: sib.outerHTML,
    style: sib.getAttribute('style'),
    display: window.getComputedStyle(sib).display,
    rect: { x: sib.getBoundingClientRect().x, y: sib.getBoundingClientRect().y, w: sib.getBoundingClientRect().width, h: sib.getBoundingClientRect().height }
  } : 'no sibling';
})()
"""

print(eval_js(js))

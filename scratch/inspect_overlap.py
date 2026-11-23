from cdp_helper import eval_js

js = """
(() => {
  const elements = Array.from(document.querySelectorAll('*')).filter(e => e.innerText && (e.innerText.includes('Export Salary') || e.innerText.includes('Reset')));
  return JSON.stringify(elements.map(e => ({
    text: e.innerText.slice(0, 30),
    tag: e.tagName,
    className: (e.className || '').toString(),
    style: e.getAttribute('style'),
    computedStyle: {
      position: window.getComputedStyle(e).position,
      left: window.getComputedStyle(e).left,
      display: window.getComputedStyle(e).display
    },
    rect: { left: Math.round(e.getBoundingClientRect().left), top: Math.round(e.getBoundingClientRect().top), width: Math.round(e.getBoundingClientRect().width), height: Math.round(e.getBoundingClientRect().height) }
  })));
})()
"""
print(eval_js(js))

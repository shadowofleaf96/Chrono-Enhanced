from cdp_helper import eval_js
import json

js = """
(() => {
  const allDivs = Array.from(document.querySelectorAll('div')).filter(d => (d.innerText || '').includes('Total Tasks') && (d.innerText || '').includes('Pending Delivery'));
  return allDivs.map(d => ({
    className: d.className,
    style: d.getAttribute('style'),
    cols: Array.from(d.children).map(c => ({
      tag: c.tagName,
      className: c.className,
      style: c.getAttribute('style')
    }))
  }));
})()
"""

print(json.dumps(eval_js(js), indent=2))

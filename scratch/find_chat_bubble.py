from cdp_helper import eval_js

js = """
(() => {
  const elements = Array.from(document.querySelectorAll('*')).filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 30 && r.width < 80 && r.height > 30 && r.height < 80 && r.right > 350 && r.bottom > 700;
  });
  return JSON.stringify(elements.map(e => ({
    tag: e.tagName,
    id: e.id,
    className: (e.className || '').toString(),
    style: e.getAttribute('style'),
    rect: e.getBoundingClientRect()
  })));
})()
"""
print(eval_js(js))

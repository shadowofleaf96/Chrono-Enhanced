from cdp_helper import eval_js

js = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  const items = Array.from(drawer.querySelectorAll('*')).filter(e => e.innerText && ['Consignments', 'FM and LM Trips', 'Bags'].includes(e.innerText.trim()));
  return JSON.stringify(items.map(e => ({
    text: e.innerText.trim(),
    tag: e.tagName,
    className: (e.className || '').toString(),
    parentClass: (e.parentElement?.className || '').toString(),
    href: e.getAttribute('href'),
    role: e.getAttribute('role')
  })));
})()
"""
print(eval_js(js))

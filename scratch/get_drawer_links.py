from cdp_helper import eval_js

js = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  const links = Array.from(drawer.querySelectorAll('a[href]')).map(a => ({
    text: a.innerText.trim(),
    href: a.getAttribute('href')
  }));
  return JSON.stringify(links);
})()
"""
print(eval_js(js))

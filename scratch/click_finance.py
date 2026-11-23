from cdp_helper import eval_js
import time

js = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  const items = Array.from(drawer.querySelectorAll('li.ant-menu-item'));
  const fin = items.find(e => e.innerText.trim() === 'Finance Operations');
  if (fin) {
    fin.click();
    return true;
  }
  return false;
})()
"""
eval_js(js)
time.sleep(0.5)

js2 = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  return JSON.stringify(Array.from(drawer.querySelectorAll('a[href]')).map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') })));
})()
"""
print(eval_js(js2))

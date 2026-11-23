from cdp_helper import eval_js

js = """
(() => {
  const hamburger = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
  const nav = document.querySelector('header') || document.querySelector('[class*="navbar-"]');
  for (const elem of [hamburger, nav]) {
    if (!elem) continue;
    const k = Object.keys(elem).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    let cur = elem[k];
    while (cur) {
      if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
        cur.memoizedProps.toggleSideMenu();
        return true;
      }
      cur = cur.return;
    }
  }
  return false;
})()
"""
eval_js(js)
import time
time.sleep(0.5)

js2 = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  return JSON.stringify({
    isOpen: drawer.classList.contains('ant-drawer-open'),
    links: Array.from(drawer.querySelectorAll('a[href]')).map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') }))
  });
})()
"""
print(eval_js(js2))

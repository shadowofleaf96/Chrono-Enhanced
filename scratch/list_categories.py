from cdp_helper import eval_js

js = """
(() => {
  // open drawer
  const hamburger = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
  const nav = document.querySelector('header') || document.querySelector('[class*="navbar-"]');
  for (const elem of [hamburger, nav]) {
    if (!elem) continue;
    const k = Object.keys(elem).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    let cur = elem[k];
    while (cur) {
      if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
        const d = document.querySelector('.ant-drawer-open');
        if (!d) cur.memoizedProps.toggleSideMenu();
        break;
      }
      cur = cur.return;
    }
  }
  return true;
})()
"""
eval_js(js)
import time
time.sleep(0.5)

js2 = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  const menuItems = Array.from(drawer.querySelectorAll('li.ant-menu-item')).map(li => li.innerText.trim());
  return JSON.stringify(menuItems);
})()
"""
print(eval_js(js2))

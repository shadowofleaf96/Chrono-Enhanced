from cdp_helper import eval_js
import time

js = """
(() => {
  // trigger side menu if not open
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer || !drawer.classList.contains('ant-drawer-open')) {
    const hamburger = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
    const nav = document.querySelector('header') || document.querySelector('[class*="navbar-"]');
    for (const elem of [hamburger, nav]) {
      if (!elem) continue;
      const k = Object.keys(elem).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      let cur = elem[k];
      while (cur) {
        if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
          cur.memoizedProps.toggleSideMenu();
          break;
        }
        cur = cur.return;
      }
    }
  }
  return true;
})()
"""
eval_js(js)
time.sleep(0.5)

js2 = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  const items = Array.from(drawer.querySelectorAll('li.ant-menu-item, [class*="menuItem"]'));
  const rider = items.find(e => e.innerText && e.innerText.trim().includes('Rider and Vehicle'));
  if (rider) {
    rider.click();
    return true;
  }
  return false;
})()
"""
print('Clicked Rider:', eval_js(js2))
time.sleep(0.5)

js3 = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  return JSON.stringify(Array.from(drawer.querySelectorAll('a[href]')).map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') })));
})()
"""
print('Rider Links:', eval_js(js3))

from cdp_helper import eval_js

js = """
(() => {
  // First, remove the aggressive click listener or prevent auto-close
  const drawer = document.querySelector('.ant-drawer');
  // Trigger side menu
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
print(eval_js(js))

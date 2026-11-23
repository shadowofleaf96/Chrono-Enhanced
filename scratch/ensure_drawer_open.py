from cdp_helper import eval_js

js = """
(() => {
  // open drawer if not opened
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
  return true;
})()
"""
print(eval_js(js))

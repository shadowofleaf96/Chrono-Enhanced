from cdp_helper import eval_js

js = """
(() => {
  // trigger side menu
  const hamburger = document.getElementById('sidemenu_hamburger_icon') || document.querySelector('[id*="hamburger"]');
  const nav = document.querySelector('header') || document.querySelector('[class*="navbar-"]');
  let opened = false;
  for (const elem of [hamburger, nav]) {
    if (!elem) continue;
    const k = Object.keys(elem).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    let cur = elem[k];
    while (cur) {
      if (cur.memoizedProps && typeof cur.memoizedProps.toggleSideMenu === 'function') {
        cur.memoizedProps.toggleSideMenu();
        opened = true;
        break;
      }
      cur = cur.return;
    }
    if (opened) break;
  }
  return { opened };
})()
"""
print(eval_js(js))

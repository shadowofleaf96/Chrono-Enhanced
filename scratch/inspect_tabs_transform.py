from cdp_helper import eval_js

js = """
(() => {
  const navWrap = document.querySelector('.ant-tabs-nav-wrap');
  const navList = document.querySelector('.ant-tabs-nav-list');
  return JSON.stringify({
    navWrapTransform: window.getComputedStyle(navWrap).transform,
    navListTransform: window.getComputedStyle(navList).transform,
    navWrapScrollLeft: navWrap.scrollLeft
  });
})()
"""
print(eval_js(js))

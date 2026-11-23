from cdp_helper import eval_js

js = """
(() => {
  const navWrap = document.querySelector('.ant-tabs-nav-wrap');
  navWrap.scrollLeft = 250;
  return { scrollLeftAfter: navWrap.scrollLeft };
})()
"""
print(eval_js(js))

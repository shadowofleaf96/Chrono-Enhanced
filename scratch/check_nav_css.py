from cdp_helper import eval_js

js = """
(() => {
  const nav = document.querySelector('.ant-tabs-nav');
  if (!nav) return 'no nav';
  return {
    cls: nav.className,
    flexDir: window.getComputedStyle(nav).flexDirection,
    wrapWidth: document.querySelector('.ant-tabs-nav-wrap').offsetWidth,
    extraWidth: document.querySelector('.ant-tabs-extra-content').offsetWidth,
  };
})()
"""

print(eval_js(js))

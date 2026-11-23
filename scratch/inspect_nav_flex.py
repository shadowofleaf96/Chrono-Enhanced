from cdp_helper import eval_js

js = """
(() => {
  const nav = document.querySelector('.ant-tabs-nav');
  if (!nav) return 'no nav';
  return {
    navDisplay: window.getComputedStyle(nav).display,
    navWidth: nav.offsetWidth,
    children: Array.from(nav.children).map(c => ({
      cls: c.className,
      flex: window.getComputedStyle(c).flex,
      width: c.offsetWidth,
      style: c.getAttribute('style')
    }))
  };
})()
"""

print(eval_js(js))

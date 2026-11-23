from cdp_helper import eval_js

js = """
(() => {
  const top = document.querySelector('[class*="Component-topDiv-"]') || document.querySelector('#root');
  if (!top) return 'no top';
  
  function dump(el, depth = 0) {
    if (depth > 5) return [];
    return Array.from(el.children).map(c => ({
      tag: c.tagName,
      cls: c.className,
      h: c.offsetHeight,
      y: c.getBoundingClientRect().y,
      pos: window.getComputedStyle(c).position,
      display: window.getComputedStyle(c).display,
      children: dump(c, depth + 1)
    }));
  }
  
  return dump(top);
})()
"""

print(eval_js(js))

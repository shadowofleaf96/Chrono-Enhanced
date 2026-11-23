from cdp_helper import eval_js

js = """
(() => {
  const tabs = document.querySelector('.ant-tabs-nav-list');
  if (!tabs) return 'no tabs';
  return {
    children: Array.from(tabs.children).map(c => ({
      tag: c.tagName,
      cls: c.className,
      text: c.textContent.trim(),
      display: window.getComputedStyle(c).display,
      rect: { x: c.getBoundingClientRect().x, y: c.getBoundingClientRect().y, w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height }
    })),
    navWrap: {
      overflow: window.getComputedStyle(tabs.parentElement).overflow,
      rect: { x: tabs.parentElement.getBoundingClientRect().x, y: tabs.parentElement.getBoundingClientRect().y, w: tabs.parentElement.getBoundingClientRect().width, h: tabs.parentElement.getBoundingClientRect().height }
    }
  };
})()
"""

print(eval_js(js))

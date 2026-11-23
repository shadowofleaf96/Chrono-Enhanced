from cdp_helper import eval_js

js = """
(() => {
  const tools = document.querySelector('[class*="filterGroupToolsRight-"]');
  if (!tools) return 'no tools';
  return JSON.stringify({
    scrollLeft: tools.scrollLeft,
    scrollWidth: tools.scrollWidth,
    clientWidth: tools.clientWidth,
    children: Array.from(tools.children).map(c => ({
      tag: c.tagName,
      className: (c.className || '').slice(0, 40),
      text: (c.innerText || '').slice(0, 30),
      rect: { left: Math.round(c.getBoundingClientRect().left), width: Math.round(c.getBoundingClientRect().width) }
    }))
  });
})()
"""
print(eval_js(js))

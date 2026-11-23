from cdp_helper import eval_js

js = """
(() => {
  const tools = document.querySelector('[class*="filterGroupToolsRight-"]');
  tools.style.setProperty('justify-content', 'flex-start', 'important');
  return JSON.stringify({
    justifyContent: window.getComputedStyle(tools).justifyContent,
    children: Array.from(tools.children).map(c => ({
      text: (c.innerText || '').slice(0, 20),
      rect: { left: Math.round(c.getBoundingClientRect().left), width: Math.round(c.getBoundingClientRect().width) }
    }))
  });
})()
"""
print(eval_js(js))

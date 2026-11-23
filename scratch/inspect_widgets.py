from cdp_helper import eval_js

js = """
(() => {
  const filterBtn = document.querySelector('#filter-toggle-btn') || Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.includes('Filtres'));
  const chatBubble = document.querySelector('[id*="chat"], [class*="chat"], #launcher, iframe[title*="chat"]');
  return JSON.stringify({
    filterBtn: filterBtn ? {
      tag: filterBtn.tagName,
      id: filterBtn.id,
      className: filterBtn.className,
      rect: filterBtn.getBoundingClientRect()
    } : null,
    chatBubble: chatBubble ? {
      tag: chatBubble.tagName,
      id: chatBubble.id,
      className: chatBubble.className,
      rect: chatBubble.getBoundingClientRect()
    } : null
  });
})()
"""
print(eval_js(js))

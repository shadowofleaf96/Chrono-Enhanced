from cdp_helper import eval_js

js = """
(() => {
  const resetBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.trim() === 'Reset All');
  if (!resetBtn) return 'no reset';
  const r = resetBtn.getBoundingClientRect();
  return {
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    parentHTML: resetBtn.parentElement.outerHTML,
    parentRect: resetBtn.parentElement.getBoundingClientRect()
  };
})()
"""

print(eval_js(js))

from cdp_helper import eval_js

js = """
(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Add Consignments'));
  if (btn) {
    btn.click();
    return 'clicked Add Consignments';
  }
  return 'not found';
})()
"""

print(eval_js(js))

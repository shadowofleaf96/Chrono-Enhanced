from cdp_helper import eval_js

js = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  // find FM and LM Trips
  const items = Array.from(drawer.querySelectorAll('li.ant-menu-item, [class*="menuItem"]'));
  const tripsItem = items.find(e => e.innerText && e.innerText.includes('FM and LM Trips'));
  if (tripsItem) {
    tripsItem.click();
    return { clicked: 'FM and LM Trips' };
  }
  return { error: 'not found' };
})()
"""
print(eval_js(js))

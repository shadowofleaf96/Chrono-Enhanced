from cdp_helper import eval_js

js = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  // Let's clone node or stopPropagation on click inside mainMenu
  const mainMenu = drawer.querySelector('[class*="mainMenu-"]');
  if (mainMenu) {
    mainMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    }, true);
  }
  
  // Find FM and LM Trips
  const items = Array.from(drawer.querySelectorAll('li.ant-menu-item, [class*="menuItem"]'));
  const tripsItem = items.find(e => e.innerText && e.innerText.includes('FM and LM Trips'));
  if (tripsItem) {
    tripsItem.click();
    return { clicked: true };
  }
  return { clicked: false };
})()
"""
print(eval_js(js))

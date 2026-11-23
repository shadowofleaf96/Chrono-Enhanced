from cdp_helper import eval_js
import time

js = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  // prevent any auto-close
  const mainMenu = drawer.querySelector('[class*="mainMenu-"]');
  if (mainMenu) {
    mainMenu.addEventListener('click', (e) => e.stopPropagation(), true);
  }
  const items = Array.from(drawer.querySelectorAll('li.ant-menu-item, [class*="menuItem"]'));
  const trips = items.find(e => e.innerText && e.innerText.trim() === 'FM and LM Trips');
  if (trips) {
    trips.click();
    return true;
  }
  return false;
})()
"""
print('Clicked:', eval_js(js))
time.sleep(0.5)

js2 = """
(() => {
  const drawer = document.querySelector('.ant-drawer');
  if (!drawer) return 'no drawer';
  return JSON.stringify({
    isOpen: drawer.classList.contains('ant-drawer-open'),
    links: Array.from(drawer.querySelectorAll('a[href]')).map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') }))
  });
})()
"""
print(eval_js(js2))

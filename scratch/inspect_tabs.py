from cdp_helper import eval_js

js = """
(() => {
  const tabs = document.querySelector('.ant-tabs-nav') || document.querySelector('[class*="tabsContainer-"]');
  const navWrap = document.querySelector('.ant-tabs-nav-wrap');
  const navList = document.querySelector('.ant-tabs-nav-list');
  const tabList = document.querySelector('[role="tablist"]');
  
  function getInfo(el) {
    if (!el) return null;
    const s = window.getComputedStyle(el);
    return {
      className: el.className,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollLeft: el.scrollLeft,
      overflowX: s.overflowX,
      touchAction: s.touchAction,
      display: s.display
    };
  }
  
  return JSON.stringify({
    tabs: getInfo(tabs),
    navWrap: getInfo(navWrap),
    navList: getInfo(navList),
    tabList: getInfo(tabList)
  });
})()
"""
print(eval_js(js))

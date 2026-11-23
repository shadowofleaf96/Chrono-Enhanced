from cdp_helper import eval_js
import json

js = """
(() => {
    const tabsNav = document.querySelector('.ant-tabs-nav');
    const tabsWrap = document.querySelector('.ant-tabs-nav-wrap');
    const tabsExtra = document.querySelector('.ant-tabs-extra-content');
    
    // Test row layout for tabsNav
    tabsNav.style.setProperty('display', 'flex', 'important');
    tabsNav.style.setProperty('flex-direction', 'row', 'important');
    tabsNav.style.setProperty('align-items', 'center', 'important');
    tabsNav.style.setProperty('justify-content', 'space-between', 'important');
    tabsNav.style.setProperty('width', '100%', 'important');
    tabsNav.style.setProperty('height', 'auto', 'important');
    
    tabsWrap.style.setProperty('flex', '1 1 auto', 'important');
    tabsWrap.style.setProperty('min-width', '0', 'important');
    tabsWrap.style.setProperty('overflow-x', 'auto', 'important');
    tabsWrap.style.setProperty('border-bottom', 'none', 'important');
    tabsWrap.style.setProperty('padding', '4px 6px', 'important');
    
    if (tabsExtra) {
        tabsExtra.style.setProperty('flex', '0 0 auto', 'important');
        tabsExtra.style.setProperty('padding', '0 8px 0 0', 'important');
        tabsExtra.style.setProperty('margin', '0', 'important');
        tabsExtra.style.setProperty('height', 'auto', 'important');
        const btn = tabsExtra.querySelector('button');
        if (btn) {
            btn.style.setProperty('height', '30px', 'important');
            btn.style.setProperty('padding', '0 8px', 'important');
            btn.style.setProperty('font-size', '12px', 'important');
            btn.style.setProperty('border-radius', '15px', 'important');
        }
    }
    
    return {
        tabsNavHeight: tabsNav.getBoundingClientRect().height,
        tabsWrapWidth: tabsWrap.getBoundingClientRect().width,
        tabsExtraWidth: tabsExtra ? tabsExtra.getBoundingClientRect().width : 0
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

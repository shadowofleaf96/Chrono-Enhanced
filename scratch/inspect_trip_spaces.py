from cdp_helper import eval_js
import json

js = """
(() => {
    function rectToObj(r) {
        if (!r) return null;
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) };
    }
    const elements = [];
    const tabsNav = document.querySelector('.ant-tabs-nav');
    const tabsExtra = document.querySelector('.ant-tabs-extra-content');
    const filterContainer = document.querySelector('[class*="containerDefaultFilter-"]');
    const rightItems = document.querySelector('[class*="rightItems-"]');
    const table = document.querySelector('.ant-table-wrapper') || document.querySelector('.ant-table');
    
    // Check all direct children of content container
    const mainDiv = document.querySelector('[class*="Ql-mainDiv-"]') || document.querySelector('[class*="mainDiv-"]');
    const mainChildren = mainDiv ? Array.from(mainDiv.children).map(c => ({
        tag: c.tagName,
        class: c.className.slice(0, 40),
        rect: rectToObj(c.getBoundingClientRect())
    })) : [];

    return {
        tabsNav: rectToObj(tabsNav?.getBoundingClientRect()),
        tabsExtra: {
            rect: rectToObj(tabsExtra?.getBoundingClientRect()),
            text: tabsExtra?.textContent.trim(),
            display: tabsExtra ? window.getComputedStyle(tabsExtra).display : null,
            computedHeight: tabsExtra ? window.getComputedStyle(tabsExtra).height : null
        },
        filterContainer: {
            rect: rectToObj(filterContainer?.getBoundingClientRect()),
            computedHeight: filterContainer ? window.getComputedStyle(filterContainer).height : null,
            padding: filterContainer ? window.getComputedStyle(filterContainer).padding : null,
            margin: filterContainer ? window.getComputedStyle(filterContainer).margin : null
        },
        rightItems: {
            rect: rectToObj(rightItems?.getBoundingClientRect()),
            text: rightItems?.textContent.trim(),
            computedHeight: rightItems ? window.getComputedStyle(rightItems).height : null
        },
        table: rectToObj(table?.getBoundingClientRect()),
        mainChildren: mainChildren
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))

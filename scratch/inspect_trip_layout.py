import sys
from cdp_helper import eval_js

js = """
(() => {
  // Check location
  const loc = window.location.href;
  
  // Inspect Trip Manager layout elements if on trip manager or consignments
  const tripNav = document.querySelector('.ant-tabs-nav');
  const tabsContainer = document.querySelector('[class*="tabsContainer-"]');
  const filterRow = document.querySelector('[class*="containerDefaultFilter-"]');
  const actionDiv = document.querySelector('[class*="rightItems-"]');
  const tableContainer = document.querySelector('.ant-table-container');
  const mainDiv = document.querySelector('[class*="mainDiv-"]');

  return {
    loc,
    tripNav: tripNav ? { h: tripNav.offsetHeight, display: window.getComputedStyle(tripNav).display } : null,
    tabsContainer: tabsContainer ? { h: tabsContainer.offsetHeight, style: tabsContainer.getAttribute('style') } : null,
    filterRow: filterRow ? { h: filterRow.offsetHeight, mb: window.getComputedStyle(filterRow).marginBottom } : null,
    actionDiv: actionDiv ? { h: actionDiv.offsetHeight, display: window.getComputedStyle(actionDiv).display } : null,
    tableContainer: tableContainer ? { h: tableContainer.offsetHeight, scrollH: tableContainer.scrollHeight } : null,
    bodyH: document.body.offsetHeight,
    windowH: window.innerHeight
  };
})()
"""

print(eval_js(js))

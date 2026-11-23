from cdp_helper import eval_js

js = """
(() => {
  const all = Array.from(document.querySelectorAll('*'));
  const linkEl = all.find(e => e.children.length === 0 && e.textContent && e.textContent.includes('View Rider Transactions'));
  const target = linkEl ? linkEl.closest('div') : null;
  const container = document.querySelector('[class*="Component-topDiv-"]') || document.querySelector('[class*="mainDiv-"]');
  
  // Find table and where it is in the DOM relative to target
  const table = document.querySelector('.ant-table-wrapper') || document.querySelector('.ant-table');
  
  return {
    linkHTML: target ? target.outerHTML : null,
    linkParentHTML: target && target.parentElement ? target.parentElement.className : null,
    tableParentHTML: table && table.parentElement ? table.parentElement.className : null,
    isTableAfterLink: table && target ? (table.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING) !== 0 : null,
    linkRect: target ? { x: target.getBoundingClientRect().x, y: target.getBoundingClientRect().y, w: target.getBoundingClientRect().width, h: target.getBoundingClientRect().height } : null,
    tableRect: table ? { x: table.getBoundingClientRect().x, y: table.getBoundingClientRect().y, w: table.getBoundingClientRect().width, h: table.getBoundingClientRect().height } : null
  };
})()
"""

print(eval_js(js))

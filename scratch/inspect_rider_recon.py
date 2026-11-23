import sys
from cdp_helper import eval_js

js = """
(() => {
  const link = Array.from(document.querySelectorAll('a, button, div, span')).find(e => e.textContent && e.textContent.includes('View Rider Transactions'));
  const table = document.querySelector('.ant-table');
  const tableParent = table ? table.parentElement : null;
  const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Reset All'));
  
  return {
    link: link ? {
      tag: link.tagName,
      cls: link.className,
      rect: link.getBoundingClientRect(),
      parentCls: link.parentElement ? link.parentElement.className : null,
      parentHTML: link.parentElement ? link.parentElement.outerHTML.substring(0, 300) : null
    } : 'no link',
    table: table ? {
      rect: table.getBoundingClientRect(),
      parentCls: tableParent ? tableParent.className : null
    } : 'no table'
  };
})()
"""

print(eval_js(js))

from cdp_helper import eval_js

js = """
(() => {
  const style = document.createElement('style');
  style.id = 'test-table-fix';
  style.innerHTML = `
    [class*="tabDataContainer-"] {
      display: flex !important;
      flex-direction: column !important;
      flex: 1 1 auto !important;
      height: 100% !important;
      min-height: 0 !important;
    }
    [class*="Ql-mainDiv-"] {
      display: flex !important;
      flex-direction: column !important;
      flex: 1 1 auto !important;
      height: 100% !important;
      min-height: 0 !important;
    }
    [class*="Ql-tableContainer-"] {
      display: flex !important;
      flex-direction: column !important;
      flex: 1 1 auto !important;
      height: 100% !important;
      min-height: 0 !important;
    }
  `;
  document.head.appendChild(style);
  const ql = document.querySelector('[class*="Ql-mainDiv-"]');
  const tc = document.querySelector('[class*="Ql-tableContainer-"]');
  return JSON.stringify({
    qlRect: { top: ql.getBoundingClientRect().top, height: ql.getBoundingClientRect().height, bottom: ql.getBoundingClientRect().bottom },
    tcRect: { top: tc.getBoundingClientRect().top, height: tc.getBoundingClientRect().height, bottom: tc.getBoundingClientRect().bottom }
  });
})()
"""
print(eval_js(js))

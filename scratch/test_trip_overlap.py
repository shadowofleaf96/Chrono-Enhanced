from cdp_helper import eval_js

js = """
(() => {
  const style = document.createElement('style');
  style.id = 'test-trip-overlap';
  style.innerHTML = `
    [class*="containerDefaultFilter-"] > div {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      align-items: stretch !important;
      gap: 8px !important;
    }
    [class*="containerDefaultFilter-"] [class*="mainDiv-"] {
      width: 100% !important;
      min-width: 100% !important;
    }
    [class*="rightItems-"] {
      width: 100% !important;
      max-width: 100vw !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 4px 8px !important;
    }
  `;
  document.head.appendChild(style);
  return 'applied';
})()
"""
print(eval_js(js))

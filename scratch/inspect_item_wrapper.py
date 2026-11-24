from cdp_helper import eval_js
import json

js = """
(() => {
  const el = document.querySelector('[class*="itemsWrapper-"]');
  if (!el) return 'Not found';
  const cs = window.getComputedStyle(el);
  const items = Array.from(el.children).map(c => {
    const ics = window.getComputedStyle(c);
    return {
      className: c.className,
      width: ics.width,
      flex: ics.flex,
      text: c.innerText.replace(/\\n/g, ': ')
    };
  });
  return {
    display: cs.display,
    flexWrap: cs.flexWrap,
    gridTemplateColumns: cs.gridTemplateColumns,
    width: cs.width,
    items: items
  };
})()
"""

print(json.dumps(eval_js(js), indent=2))

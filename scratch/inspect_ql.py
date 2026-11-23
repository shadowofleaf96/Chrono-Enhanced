from cdp_helper import eval_js

js = """
(() => {
  const ql = document.querySelector('[class*="Ql-mainDiv-"]');
  const parent = ql.parentElement;
  return JSON.stringify({
    qlInlineStyle: ql.getAttribute('style'),
    parentClass: parent.className,
    parentInlineStyle: parent.getAttribute('style'),
    parentComputedHeight: window.getComputedStyle(parent).height,
    parentDisplay: window.getComputedStyle(parent).display,
    parentFlex: window.getComputedStyle(parent).flexDirection,
    parentRect: { top: parent.getBoundingClientRect().top, height: parent.getBoundingClientRect().height }
  });
})()
"""
print(eval_js(js))

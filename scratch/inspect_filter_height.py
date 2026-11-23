from cdp_helper import eval_js

js = """
(() => {
  const f = document.querySelector('[class*="containerDefaultFilter-"]');
  if (!f) return 'no f';
  const main = f.parentElement;
  return {
    f: {
      h: f.offsetHeight,
      styleH: f.style.height,
      csH: window.getComputedStyle(f).height,
      maxH: window.getComputedStyle(f).maxHeight,
      flex: window.getComputedStyle(f).flex
    },
    main: {
      cls: main.className,
      display: window.getComputedStyle(main).display,
      flexDir: window.getComputedStyle(main).flexDirection
    }
  };
})()
"""

print(eval_js(js))

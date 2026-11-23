from cdp_helper import eval_js

js = """
(() => {
  const hamburger = document.getElementById('sidemenu_hamburger_icon');
  if (!hamburger) return 'no hamburger';
  const k = Object.keys(hamburger).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  const props = hamburger[k] ? hamburger[k].memoizedProps : null;
  return JSON.stringify({
    hasReactFiber: !!k,
    onClick: props ? typeof props.onClick : null,
    onMouseDown: props ? typeof props.onMouseDown : null,
    onTouchStart: props ? typeof props.onTouchStart : null,
    tag: hamburger.tagName,
    classes: hamburger.className
  });
})()
"""
print(eval_js(js))

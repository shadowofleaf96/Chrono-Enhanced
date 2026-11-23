from cdp_helper import eval_js

js = """
(() => {
  const iframes = Array.from(document.querySelectorAll('iframe'));
  return JSON.stringify(iframes.map(f => ({
    id: f.id,
    name: f.name,
    title: f.title,
    src: f.src,
    style: f.getAttribute('style')
  })));
})()
"""
print(eval_js(js))

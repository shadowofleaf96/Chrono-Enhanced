import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(() => {
    const p1 = document.querySelectorAll('.ant-tabs-tabpane')[1]?.innerHTML || '';
    const p2 = document.querySelectorAll('.ant-tabs-tabpane')[2]?.innerHTML || '';
    return { p1, p2 };
})()
"""

res = eval_js(js)
with open('scratch/pane1.html', 'w', encoding='utf-8') as f:
    f.write(res['p1'])
with open('scratch/pane2.html', 'w', encoding='utf-8') as f:
    f.write(res['p2'])
print("Pane 1 length:", len(res['p1']), "Pane 2 length:", len(res['p2']))

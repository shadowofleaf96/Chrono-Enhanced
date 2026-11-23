import sys
from cdp_helper import eval_js

code = sys.stdin.read()
res = eval_js(code)
print(res)

import sys
from cdp_helper import eval_js

path = sys.argv[1] if len(sys.argv) > 1 else '/ops/consignments'
js = f"window.location.href = '{path}';"
print(eval_js(js))
